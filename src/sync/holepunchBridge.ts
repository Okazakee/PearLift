import b4a from 'b4a';
import RPC from 'bare-rpc';
import { documentDirectory } from 'expo-file-system/legacy';
import { Worklet } from 'react-native-bare-kit';
import { logSyncError, logSyncEvent } from './logger';
import {
  RPC_SYNC_LOG_EVENT,
  RPC_SYNC_PUBLISH,
  RPC_SYNC_REMOTE_OP_EVENT,
  RPC_SYNC_START,
  RPC_SYNC_STATUS,
  RPC_SYNC_STATUS_EVENT,
  RPC_SYNC_STOP,
} from './rpcCommands';
import syncBundle from './sync.bundle.mjs';
import type {
  StartSyncInput,
  SyncBridge,
  SyncHealth,
  SyncOpEnvelope,
} from './types';
import { INITIAL_SYNC_HEALTH } from './types';

type RpcLike = {
  request: (command: number) => {
    send: (data?: Uint8Array | string) => void;
    reply: (encoding?: string) => Promise<Uint8Array | string>;
  };
};

type RuntimeRpcMessage = {
  command: number;
  data: Uint8Array | null;
};
type RuntimeLogMessage = {
  level?: 'error' | 'warn' | 'info' | 'debug';
  scope?: string;
  event?: string;
  message?: string;
  details?: Record<string, unknown>;
};

function encodeJson(value: unknown) {
  return b4a.from(JSON.stringify(value));
}

function decodeJson<T>(value: Uint8Array | string): T {
  const asString = typeof value === 'string' ? value : b4a.toString(value);
  return JSON.parse(asString) as T;
}

async function requestJson<TReq, TRes>(
  rpc: RpcLike,
  command: number,
  payload: TReq,
) {
  const req = rpc.request(command);
  req.send(encodeJson(payload));
  const raw = await req.reply();
  return decodeJson<TRes>(raw);
}

export class HolepunchWorkletBridge implements SyncBridge {
  private worklet: Worklet | null = null;
  private rpc: RpcLike | null = null;
  private readonly remoteListeners = new Set<(op: SyncOpEnvelope) => void>();
  private readonly statusListeners = new Set<(health: SyncHealth) => void>();

  private normalizeStoragePath(pathOrUri: string) {
    // Expo FileSystem uses file:// URIs; Bare/Corestore expects a real path.
    if (pathOrUri.startsWith('file://')) {
      return decodeURIComponent(pathOrUri.replace(/^file:\/\//, ''));
    }
    return pathOrUri;
  }

  private getStoragePath() {
    const dir = documentDirectory;
    if (!dir) {
      throw new Error('expo-file-system documentDirectory is unavailable.');
    }
    return this.normalizeStoragePath(dir);
  }

  private ensureRuntime() {
    if (this.worklet && this.rpc) {
      return;
    }

    const worklet = new Worklet();
    if (typeof syncBundle === 'string') {
      worklet.start('/sync.bundle', syncBundle, [this.getStoragePath()]);
    } else {
      worklet.start('/sync.bundle', new Uint8Array(syncBundle), [
        this.getStoragePath(),
      ]);
    }

    const rpc = new RPC(worklet.IPC as never, (req: unknown) => {
      const message = req as RuntimeRpcMessage;

      if (message.command === RPC_SYNC_REMOTE_OP_EVENT && message.data) {
        const op = decodeJson<SyncOpEnvelope>(message.data);
        for (const listener of this.remoteListeners) {
          listener(op);
        }
        return;
      }

      if (message.command === RPC_SYNC_STATUS_EVENT && message.data) {
        const raw = decodeJson<Partial<SyncHealth>>(message.data);
        const health: SyncHealth = { ...INITIAL_SYNC_HEALTH, ...raw };
        for (const listener of this.statusListeners) {
          listener(health);
        }
        return;
      }

      if (message.command === RPC_SYNC_LOG_EVENT && message.data) {
        const payload = decodeJson<RuntimeLogMessage>(message.data);
        const level =
          payload.level === 'warn'
            ? 'warn'
            : payload.level === 'error'
              ? 'error'
              : 'info';
        logSyncEvent(
          level,
          payload.scope ?? 'backend',
          payload.event ?? 'event',
          payload.message ?? '',
          payload.details,
        );
      }
    });

    this.worklet = worklet;
    this.rpc = rpc as unknown as RpcLike;
  }

  async start(input: StartSyncInput): Promise<{ bootstrapKeyHex: string }> {
    this.ensureRuntime();
    if (!this.rpc) {
      logSyncError('bridge', 'start_unavailable', 'Holepunch RPC unavailable');
      throw new Error('Holepunch RPC unavailable');
    }

    const response = await requestJson<
      StartSyncInput & { storagePath: string },
      { bootstrapKeyHex?: string; ok?: boolean; error?: string }
    >(this.rpc, RPC_SYNC_START, {
      ...input,
      storagePath: this.getStoragePath(),
    });

    if (response.error) {
      logSyncError('bridge', 'start_failed', response.error);
      throw new Error(response.error);
    }

    return { bootstrapKeyHex: response.bootstrapKeyHex ?? '' };
  }

  async stop(): Promise<void> {
    if (!this.rpc) {
      this.worklet?.terminate();
      this.worklet = null;
      return;
    }

    try {
      await requestJson(this.rpc, RPC_SYNC_STOP, { stop: true });
    } finally {
      this.worklet?.terminate();
      this.worklet = null;
      this.rpc = null;
    }
  }

  async publish(op: SyncOpEnvelope): Promise<void> {
    if (!this.rpc) {
      logSyncError(
        'bridge',
        'publish_without_runtime',
        'Sync runtime not started.',
      );
      throw new Error('Sync runtime not started.');
    }

    const response = await requestJson<
      SyncOpEnvelope,
      { ok?: boolean; error?: string }
    >(this.rpc, RPC_SYNC_PUBLISH, op);

    if (response.error) {
      logSyncError('bridge', 'publish_failed', response.error);
      throw new Error(response.error);
    }
  }

  onRemoteOp(cb: (op: SyncOpEnvelope) => void): () => void {
    this.remoteListeners.add(cb);
    return () => {
      this.remoteListeners.delete(cb);
    };
  }

  onStatus(cb: (health: SyncHealth) => void): () => void {
    this.statusListeners.add(cb);
    void this.pullStatus();
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private async pullStatus() {
    if (!this.rpc) {
      return;
    }

    try {
      const raw = await requestJson<{ now: number }, Partial<SyncHealth>>(
        this.rpc,
        RPC_SYNC_STATUS,
        { now: Date.now() },
      );
      const status: SyncHealth = { ...INITIAL_SYNC_HEALTH, ...raw };
      for (const listener of this.statusListeners) {
        listener(status);
      }
    } catch {
      // Ignore status pull errors to keep sync startup resilient.
    }
  }
}
