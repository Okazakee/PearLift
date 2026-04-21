import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type {
  WorkoutMutation,
  WorkoutRepository,
  WorkoutStoreSnapshot,
} from '../storage';
import { logError } from '../utils/errors';
import { createSyncBridge } from './bridge';
import { canonicalizeMutationForSync } from './canonicalize';
import { logSyncError, logSyncEvent } from './logger';
import type {
  SyncBridge,
  SyncHealth,
  SyncManager,
  SyncMutation,
  SyncOpEnvelope,
} from './types';
import { INITIAL_SYNC_HEALTH } from './types';

const SYNC_SECRET_KEY = 'pearlift.sync.secret';

function nowIso() {
  return new Date().toISOString();
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function createOpId(deviceId: string, lamport: number) {
  return `${deviceId}:${lamport}`;
}

function getOpPayload(
  op: SyncOpEnvelope,
): { kind: 'presence' } | { kind: 'mutation'; mutation: SyncMutation } {
  if (op.payload) {
    return op.payload;
  }

  if (op.mutation) {
    return {
      kind: 'mutation',
      mutation: op.mutation,
    };
  }

  throw new Error(`Sync op ${op.opId} is missing payload.`);
}

async function loadOrCreatePairingSecret() {
  const existing = await SecureStore.getItemAsync(SYNC_SECRET_KEY);
  if (existing) return existing;
  const bytes = await Crypto.getRandomBytesAsync(32);
  const generated = toHex(bytes);
  await SecureStore.setItemAsync(SYNC_SECRET_KEY, generated);
  return generated;
}

class SyncManagerImpl implements SyncManager {
  private readonly bridge: SyncBridge;
  private readonly healthListeners = new Set<(health: SyncHealth) => void>();
  private readonly repository: WorkoutRepository;

  private unsubscribeStatus: (() => void) | null = null;
  private unsubscribeRemoteOp: (() => void) | null = null;

  private active = false;
  private deviceId: string | null = null;
  private lastLoggedBackendError: string | null = null;
  private startTask: Promise<void> | null = null;
  private stopTask: Promise<void> | null = null;

  private health: SyncHealth = { ...INITIAL_SYNC_HEALTH };

  constructor(repository: WorkoutRepository, bridge?: SyncBridge) {
    this.repository = repository;
    this.bridge = createSyncBridge(bridge);
  }

  isActive() {
    return this.active;
  }

  onHealth(cb: (health: SyncHealth) => void) {
    this.healthListeners.add(cb);
    cb(this.health);
    return () => {
      this.healthListeners.delete(cb);
    };
  }

  async start(pairingSecretHex?: string) {
    if (this.active) {
      return;
    }
    if (this.startTask) {
      return this.startTask;
    }

    this.startTask = (async () => {
      this.setHealth({ ...this.health, status: 'connecting', lastError: null });
      logSyncEvent(
        'info',
        'manager',
        'start_requested',
        'Sync start requested.',
      );

      try {
        const secret = pairingSecretHex ?? (await loadOrCreatePairingSecret());
        const deviceId = await this.repository.getOrCreateDeviceId();
        this.deviceId = deviceId;

        this.unsubscribeStatus = this.bridge.onStatus((health) => {
          this.setHealth({
            ...this.health,
            ...health,
            lastError: health.lastError,
          });
        });

        this.unsubscribeRemoteOp = this.bridge.onRemoteOp((op) => {
          void this.handleRemoteOp(op);
        });

        const state = await this.repository.getSyncState();
        const started = await this.bridge.start({
          pairingSecretHex: secret,
          deviceId,
          bootstrapKeyHex: state.autobaseBootstrapKey,
        });

        await this.repository.setSyncState({
          syncEnabled: true,
          autobaseBootstrapKey: started.bootstrapKeyHex,
          lastError: null,
        });

        this.active = true;
        this.setHealth({
          ...this.health,
          lastError: null,
        });
        logSyncEvent('info', 'manager', 'started', 'Sync started.');
      } catch (error) {
        logError('sync/start failed', error);
        logSyncError('manager', 'start_failed', error);
        const message =
          error instanceof Error ? error.message : 'Sync start failed';
        await this.repository.setSyncState({
          syncEnabled: false,
          lastError: message,
        });
        this.setHealth({
          ...this.health,
          status: 'error',
          lastError: message,
        });
        throw error;
      } finally {
        this.startTask = null;
      }
    })();

    return this.startTask;
  }

  async stop() {
    if (this.stopTask) {
      return this.stopTask;
    }

    this.stopTask = (async () => {
      try {
        if (this.startTask) {
          try {
            await this.startTask;
          } catch {
            // Ignore start failures when explicitly stopping.
          }
        }
        await this.bridge.stop();
        logSyncEvent('info', 'manager', 'stopped', 'Sync stopped.');
      } finally {
        // stop should never crash the app; surface failures in logs.
        // (bridge.stop errors will be thrown before finally runs)
        this.unsubscribeStatus?.();
        this.unsubscribeRemoteOp?.();
        this.unsubscribeStatus = null;
        this.unsubscribeRemoteOp = null;
        this.active = false;
        this.setHealth({
          ...INITIAL_SYNC_HEALTH,
          lastSyncedAt: this.health.lastSyncedAt,
        });
        await this.repository.setSyncState({ syncEnabled: false });
        this.stopTask = null;
      }
    })();

    return this.stopTask;
  }

  async publishLocalMutation(
    mutation: WorkoutMutation,
    snapshot: WorkoutStoreSnapshot | null,
  ) {
    if (!this.active || !this.deviceId) {
      return;
    }

    const canonical = canonicalizeMutationForSync(mutation, snapshot);
    if (!canonical) {
      return;
    }

    const lamport = await this.repository.nextLamport();
    const op: SyncOpEnvelope = {
      schemaVersion: 1,
      opId: createOpId(this.deviceId, lamport),
      deviceId: this.deviceId,
      lamport,
      createdAt: nowIso(),
      payload: {
        kind: 'mutation',
        mutation: canonical,
      },
    };

    try {
      await this.bridge.publish(op);
    } catch (error) {
      logError('sync/publish failed', error);
      logSyncError('manager', 'publish_failed', error);
      throw error;
    }
    await this.repository.setSyncState({ lastError: null });
    if (this.health.lastError) {
      this.setHealth({ ...this.health, lastError: null });
    }
  }

  async handleRemoteOp(op: SyncOpEnvelope) {
    if (!this.deviceId) {
      this.deviceId = await this.repository.getOrCreateDeviceId();
    }

    if (op.deviceId === this.deviceId) {
      return;
    }

    const payload = getOpPayload(op);

    if (payload.kind === 'presence') {
      await this.repository.markSyncOpApplied({
        opId: op.opId,
        deviceId: op.deviceId,
        lamport: op.lamport,
      });
      const syncedAt = nowIso();
      await this.repository.setSyncState({
        lastSyncedAt: syncedAt,
        lastError: null,
      });
      this.setHealth({
        ...this.health,
        status: 'synced',
        lastSyncedAt: syncedAt,
        lastError: null,
      });
      logSyncEvent(
        'info',
        'manager',
        'presence_received',
        'Remote device presence recorded.',
        { deviceId: op.deviceId },
      );
      return;
    }

    try {
      await this.repository.applyMutation(payload.mutation, {
        origin: 'remote',
        opId: op.opId,
        deviceId: op.deviceId,
        lamport: op.lamport,
        suppressSyncEmit: true,
      });
    } catch (error) {
      logError('sync/remote apply failed', error);
      logSyncError('manager', 'remote_apply_failed', error, {
        opId: op.opId,
        deviceId: op.deviceId,
      });
      throw error;
    }

    const syncedAt = nowIso();
    await this.repository.setSyncState({
      lastSyncedAt: syncedAt,
      lastError: null,
    });
    this.setHealth({
      ...this.health,
      status: 'synced',
      lastSyncedAt: syncedAt,
      lastError: null,
    });
  }

  getHealth() {
    return this.health;
  }

  private setHealth(next: SyncHealth) {
    if (next.lastError && next.lastError !== this.lastLoggedBackendError) {
      this.lastLoggedBackendError = next.lastError;
      logError('sync/backend', next.lastError);
    }
    if (!next.lastError) {
      this.lastLoggedBackendError = null;
    }
    this.health = next;
    for (const listener of this.healthListeners) {
      listener(next);
    }
  }
}

export function createSyncManager(
  repository: WorkoutRepository,
  bridge?: SyncBridge,
): SyncManager {
  return new SyncManagerImpl(repository, bridge);
}

export async function getPairingSecretPayload(): Promise<string> {
  return loadOrCreatePairingSecret();
}

export async function clearPairingSecret(): Promise<void> {
  await SecureStore.deleteItemAsync(SYNC_SECRET_KEY);
}
