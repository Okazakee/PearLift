import RPC from 'bare-rpc';
import { deleteAsync } from 'expo-file-system/legacy';
import { documentDirectory } from 'expo-file-system/legacy';
import { getInfoAsync } from 'expo-file-system/legacy';
import { readDirectoryAsync } from 'expo-file-system/legacy';
import { Worklet } from 'react-native-bare-kit';
import type { SyncLogEntry } from '@/sync/logger';
import { logSyncError, logSyncEvent } from '@/sync/logger';
import {
  RPC_SYNC_GET_LOGS,
  RPC_SYNC_LOG_EVENT,
  RPC_SYNC_PUBLISH,
  RPC_SYNC_REMOTE_OP_EVENT,
  RPC_SYNC_START,
  RPC_SYNC_STATUS,
  RPC_SYNC_STATUS_EVENT,
  RPC_SYNC_STOP,
} from '@/sync/rpcCommands';
import { decodeRpcPayload, encodeRpcPayload } from '@/sync/rpcEncoding';
import syncBundle from './sync.bundle.mjs';
import type {
  StartSyncInput,
  SyncBridge,
  SyncHealth,
  SyncOpEnvelope,
} from '@/sync/types';
import { INITIAL_SYNC_HEALTH } from '@/sync/types';

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

type LifecycleOperation = 'start' | 'stop' | 'clear_storage';

const APP_LAUNCH_AT = new Date().toISOString();
const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_FAIL_THRESHOLD = 2;
const START_TIMEOUT_MS = 12000;
const LIFECYCLE_OPERATION_TIMEOUT_MS = 3000;
const STALE_RUNTIME_FILES = [
  'worklet-runtime.lock',
  'worklet-runtime.tmp',
  'worklet-starting.marker',
];

function hashSecretHex(secretHex: string) {
  let hash = 2166136261;
  for (let i = 0; i < secretHex.length; i += 1) {
    hash ^= secretHex.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

async function requestJson<TReq, TRes>(
  rpc: RpcLike,
  command: number,
  payload: TReq,
) {
  const req = rpc.request(command);
  req.send(encodeRpcPayload(command, 'request', payload));
  const raw = await req.reply();
  return decodeRpcPayload(command, 'response', raw) as TRes;
}

export class HolepunchWorkletBridge implements SyncBridge {
  private worklet: Worklet | null = null;
  private rpc: RpcLike | null = null;
  private readonly remoteListeners = new Set<(op: SyncOpEnvelope) => void>();
  private readonly statusListeners = new Set<(health: SyncHealth) => void>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private consecutiveHeartbeatFailures = 0;
  private startTask: Promise<{ bootstrapKeyHex: string }> | null = null;
  private lifecycleQueue: Promise<void> = Promise.resolve();
  private lastLifecycleErrorKey: string | null = null;

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

  private getRoomStorageUri() {
    const dir = documentDirectory;
    if (!dir) {
      throw new Error('expo-file-system documentDirectory is unavailable.');
    }
    return `${dir}pearlift-sync`;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label}_timeout`));
      }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  private async withLifecycleLock<T>(
    operation: LifecycleOperation,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = this.lifecycleQueue;
    const waitStartedAt = Date.now();
    const run = (async () => {
      await previous;
      const waitedMs = Date.now() - waitStartedAt;
      if (waitedMs > LIFECYCLE_OPERATION_TIMEOUT_MS) {
        this.lastLifecycleErrorKey = 'worklet_lifecycle_conflict';
        logSyncError(
          'bridge',
          'worklet_lifecycle_conflict',
          new Error('lifecycle_operation_waited'),
          {
            operation,
            waitedMs,
          },
        );
      }
      return fn();
    })();

    this.lifecycleQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private cleanupRuntime() {
    this.stopHeartbeat();
    this.rpc = null;
    if (this.worklet) {
      try {
        this.worklet.terminate();
      } catch (error) {
        this.lastLifecycleErrorKey = 'worklet_cleanup_failed';
        logSyncError('bridge', 'worklet_cleanup_failed', error);
      }
    }
    this.worklet = null;
  }

  private async runStartupHygiene() {
    const roomStorageUri = this.getRoomStorageUri();
    try {
      const info = await getInfoAsync(roomStorageUri);
      if (!info.exists) return;

      const entries = await readDirectoryAsync(roomStorageUri);
      const staleEntries = entries.filter((entry) =>
        STALE_RUNTIME_FILES.includes(entry),
      );

      for (const entry of staleEntries) {
        await deleteAsync(`${roomStorageUri}/${entry}`, { idempotent: true });
      }

      if (staleEntries.length > 0) {
        logSyncEvent(
          'info',
          'bridge',
          'worklet_startup_hygiene',
          'Removed stale sync runtime artifacts before startup.',
          { removedEntries: staleEntries },
        );
      }
    } catch (error) {
      logSyncError('bridge', 'worklet_startup_hygiene_failed', error);
    }
  }

  private ensureRuntime() {
    if (this.worklet && this.rpc) {
      return;
    }

    const storagePath = this.getStoragePath();
    const workletStartAt = new Date().toISOString();
    logSyncEvent(
      'info',
      'bridge',
      'worklet_start',
      'Starting sync worklet runtime.',
      {
        appLaunchAt: APP_LAUNCH_AT,
        workletStartAt,
        storagePath,
      },
    );

    const worklet = new Worklet();
    if (typeof syncBundle === 'string') {
      worklet.start('/sync.bundle', syncBundle, [storagePath]);
    } else {
      worklet.start('/sync.bundle', new Uint8Array(syncBundle), [storagePath]);
    }

    const rpc = new RPC(worklet.IPC as never, (req: unknown) => {
      const message = req as RuntimeRpcMessage;
      try {
        if (message.command === RPC_SYNC_REMOTE_OP_EVENT && message.data) {
          const op = decodeRpcPayload(
            message.command,
            'event',
            message.data,
          ) as SyncOpEnvelope;
          logSyncEvent(
            'info',
            'bridge',
            'remote_op_event',
            'Received remote op event from backend.',
            {
              opId: op.opId,
              deviceId: op.deviceId,
              lamport: op.lamport,
              payloadKind: op.payload?.kind ?? null,
            },
          );
          for (const listener of this.remoteListeners) {
            listener(op);
          }
          return;
        }

        if (message.command === RPC_SYNC_STATUS_EVENT && message.data) {
          const raw = decodeRpcPayload(
            message.command,
            'event',
            message.data,
          ) as Partial<SyncHealth>;
          const health: SyncHealth = { ...INITIAL_SYNC_HEALTH, ...raw };
          logSyncEvent(
            'info',
            'bridge',
            'status_event',
            'Received status event from backend.',
            {
              status: health.status,
              peers: health.peers,
              connections: health.connections,
              bootstrapped: health.bootstrapped,
              reconnectAttempts: health.reconnectAttempts,
              lastError: health.lastError,
              topicHex: health.topicHex,
            },
          );
          for (const listener of this.statusListeners) {
            listener(health);
          }
          return;
        }

        if (message.command === RPC_SYNC_LOG_EVENT && message.data) {
          const payload = decodeRpcPayload(
            message.command,
            'event',
            message.data,
          ) as {
            level?: 'error' | 'warn' | 'info' | 'debug';
            deviceTag?: string;
            scope?: string;
            event?: string;
            message?: string;
            details?: Record<string, unknown>;
          };
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
            payload.deviceTag,
          );
        }
      } catch (error) {
        logSyncError('bridge', 'event_decode_failed', error, {
          command: message.command,
        });
      }
    });

    this.worklet = worklet;
    this.rpc = rpc as unknown as RpcLike;
  }

  async start(input: StartSyncInput): Promise<{ bootstrapKeyHex: string }> {
    if (this.startTask) return this.startTask;

    this.startTask = this.withLifecycleLock('start', async () => {
      const startedAt = Date.now();
      await this.runStartupHygiene();
      this.ensureRuntime();

      if (!this.rpc) {
        this.lastLifecycleErrorKey = 'worklet_start_failed';
        logSyncError(
          'bridge',
          'worklet_start_failed',
          'Holepunch RPC unavailable',
        );
        throw new Error('Holepunch RPC unavailable');
      }

      const storagePath = this.getStoragePath();
      logSyncEvent(
        'info',
        'bridge',
        'start_request',
        'Sending SYNC_START to worklet backend.',
        {
          appLaunchAt: APP_LAUNCH_AT,
          startRequestAt: new Date().toISOString(),
          storagePath,
          deviceId: input.deviceId,
          pairingSecretHash: hashSecretHex(input.pairingSecretHex),
          bootstrapKeyHexState: input.bootstrapKeyHex ? 'present' : 'absent',
          bootstrapKeyHex: input.bootstrapKeyHex ?? null,
          discoveryOnly: !!input.debug?.discoveryOnly,
          disableCursorOptimization: !!input.debug?.disableCursorOptimization,
        },
      );

      try {
        const response = await this.withTimeout(
          requestJson<
            StartSyncInput & { storagePath: string },
            { bootstrapKeyHex?: string; ok?: boolean; error?: string }
          >(this.rpc, RPC_SYNC_START, {
            ...input,
            storagePath,
          }),
          START_TIMEOUT_MS,
          'worklet_start',
        );

        if (response.error) {
          throw new Error(response.error);
        }

        this.startHeartbeat();
        this.lastLifecycleErrorKey = null;
        return { bootstrapKeyHex: response.bootstrapKeyHex ?? '' };
      } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        const message =
          error instanceof Error ? error.message : String(error);
        const isTimeout = message === 'worklet_start_timeout';
        this.lastLifecycleErrorKey = isTimeout
          ? 'worklet_start_timeout'
          : 'worklet_start_failed';
        logSyncError(
          'bridge',
          isTimeout ? 'worklet_start_timeout' : 'worklet_start_failed',
          error,
          { elapsedMs },
        );
        this.cleanupRuntime();
        throw error;
      }
    }).finally(() => {
      this.startTask = null;
    });

    return this.startTask;
  }

  async stop(): Promise<void> {
    await this.withLifecycleLock('stop', async () => {
      if (!this.rpc) {
        this.cleanupRuntime();
        return;
      }

      try {
        await this.withTimeout(
          requestJson(this.rpc, RPC_SYNC_STOP, { stop: true }),
          START_TIMEOUT_MS,
          'worklet_stop',
        );
      } catch (error) {
        logSyncError('bridge', 'worklet_stop_failed', error);
      } finally {
        this.cleanupRuntime();
      }
    });
  }

  async clearStorage(): Promise<void> {
    await this.withLifecycleLock('clear_storage', async () => {
      if (!this.rpc) {
        this.cleanupRuntime();
      } else {
        try {
          await this.withTimeout(
            requestJson(this.rpc, RPC_SYNC_STOP, { stop: true }),
            START_TIMEOUT_MS,
            'worklet_stop',
          );
        } catch (error) {
          logSyncError('bridge', 'worklet_stop_failed', error);
        } finally {
          this.cleanupRuntime();
        }
      }
      try {
        await deleteAsync(this.getRoomStorageUri(), { idempotent: true });
      } catch {
        // Ignore missing or already-cleared room storage.
      }
    });
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

  async pullLogs(): Promise<SyncLogEntry[]> {
    if (!this.rpc) return [];
    try {
      const raw = await requestJson<
        Record<string, never>,
        { entries?: SyncLogEntry[] }
      >(this.rpc, RPC_SYNC_GET_LOGS, {});
      return Array.isArray(raw.entries) ? raw.entries : [];
    } catch {
      return [];
    }
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
      this.consecutiveHeartbeatFailures = 0;
      const status: SyncHealth = { ...INITIAL_SYNC_HEALTH, ...raw };
      for (const listener of this.statusListeners) {
        listener(status);
      }
    } catch {
      if (this.lastLifecycleErrorKey === 'worklet_start_timeout') {
        return;
      }
      this.consecutiveHeartbeatFailures += 1;
      if (this.consecutiveHeartbeatFailures >= HEARTBEAT_FAIL_THRESHOLD) {
        const errorHealth: SyncHealth = {
          ...INITIAL_SYNC_HEALTH,
          status: 'error',
          lastError: 'Sync worklet unresponsive',
        };
        for (const listener of this.statusListeners) {
          listener(errorHealth);
        }
      }
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.consecutiveHeartbeatFailures = 0;
    this.heartbeatTimer = setInterval(() => {
      void this.pullStatus();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.consecutiveHeartbeatFailures = 0;
  }
}
