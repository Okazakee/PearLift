import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { AppStateStatus, NativeEventSubscription } from 'react-native';
import { AppState } from 'react-native';
import type {
  WorkoutMutation,
  WorkoutRepository,
  WorkoutStoreSnapshot,
} from '../storage';
import { logError } from '../utils/errors';
import { createSyncBridge } from './bridge';
import { canonicalizeMutationForSync } from './canonicalize';
import type { SyncLogEntry } from './logger';
import {
  combineLogs,
  getRecentLogs,
  logSyncError,
  logSyncEvent,
} from './logger';
import type {
  SyncBridge,
  SyncBridgeLogEntry,
  SyncHealth,
  SyncManager,
  SyncMutation,
  SyncOpEnvelope,
} from './types';
import { INITIAL_SYNC_HEALTH } from './types';

const SYNC_SECRET_KEY = 'pearlift.sync.secret';
const APP_LAUNCH_AT = nowIso();

function nowIso() {
  return new Date().toISOString();
}

function hashSecretHex(secretHex: string) {
  let hash = 2166136261;
  for (let i = 0; i < secretHex.length; i += 1) {
    hash ^= secretHex.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function readGlobalBoolean(name: string): boolean | null {
  const value = (globalThis as Record<string, unknown>)[name];
  return typeof value === 'boolean' ? value : null;
}

function resolveSyncDebugConfig() {
  const discoveryOnly =
    readGlobalBoolean('__PEARLIFT_SYNC_DISCOVERY_ONLY__') ?? false;
  const disableCursorOptimization =
    readGlobalBoolean('__PEARLIFT_SYNC_DISABLE_CURSOR_OPTIMIZATION__') ??
    __DEV__;
  return {
    discoveryOnly,
    disableCursorOptimization,
  };
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
  private lifecycleEpoch = 0;
  private appStateSub: NativeEventSubscription | null = null;
  private lastAppState: AppStateStatus = AppState.currentState;
  private resuming = false;

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

  async start(pairingSecretHex?: string, bootstrapKeyHex?: string) {
    if (this.active) {
      return;
    }
    if (this.startTask) {
      return this.startTask;
    }
    if (this.stopTask) {
      await this.stopTask;
    }

    this.startTask = (async () => {
      const epoch = ++this.lifecycleEpoch;
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

        this.clearBridgeSubscriptions();
        this.unsubscribeStatus = this.bridge.onStatus((health) => {
          if (epoch !== this.lifecycleEpoch) return;
          this.setHealth({
            ...this.health,
            ...health,
            lastError: health.lastError,
          });
        });

        this.unsubscribeRemoteOp = this.bridge.onRemoteOp((op) => {
          if (epoch !== this.lifecycleEpoch) return;
          void this.handleRemoteOp(op);
        });

        const state = await this.repository.getSyncState();
        const requestedBootstrapKey =
          bootstrapKeyHex ?? state.autobaseBootstrapKey;
        const debugConfig = resolveSyncDebugConfig();
        logSyncEvent(
          'info',
          'manager',
          'startup_snapshot',
          'RN startup sync snapshot.',
          {
            appLaunchAt: APP_LAUNCH_AT,
            startRequestedAt: nowIso(),
            syncEnabled: state.syncEnabled,
            storagePathSource: 'expo-file-system.documentDirectory',
            deviceId,
            pairingSecretHash: hashSecretHex(secret),
            topicHex: secret,
            bootstrapKeyHexState: requestedBootstrapKey ? 'present' : 'absent',
            bootstrapKeyHex: requestedBootstrapKey ?? null,
            discoveryOnly: debugConfig.discoveryOnly,
            disableCursorOptimization: debugConfig.disableCursorOptimization,
          },
        );
        const started = await this.bridge.start({
          pairingSecretHex: secret,
          deviceId,
          bootstrapKeyHex: requestedBootstrapKey,
          debug: debugConfig,
        });

        if (epoch !== this.lifecycleEpoch) {
          try {
            await this.bridge.stop();
          } catch (error) {
            logSyncError('manager', 'stale_start_stop_failed', error);
          }
          return;
        }

        const startedBootstrapKey = started.bootstrapKeyHex?.trim() ?? '';
        const bootstrapKeyToStore =
          requestedBootstrapKey && requestedBootstrapKey.length > 0
            ? requestedBootstrapKey
            : startedBootstrapKey.length > 0
              ? startedBootstrapKey
              : null;

        await this.repository.setSyncState({
          syncEnabled: true,
          lastError: null,
          ...(bootstrapKeyToStore
            ? { autobaseBootstrapKey: bootstrapKeyToStore }
            : {}),
        });

        if (!bootstrapKeyToStore) {
          logSyncEvent(
            'warn',
            'manager',
            'missing_bootstrap_key',
            'Start returned no bootstrap key.',
            {
              hadRequestedBootstrapKey: !!requestedBootstrapKey,
              hadStartedBootstrapKey: !!startedBootstrapKey,
            },
          );
        }

        this.active = true;
        this.setHealth({
          ...this.health,
          lastError: null,
        });
        this.attachAppStateListener();
        logSyncEvent('info', 'manager', 'started', 'Sync started.');
      } catch (error) {
        logError('sync/start failed', error);
        logSyncError('manager', 'start_failed', error);
        this.clearBridgeSubscriptions();
        this.detachAppStateListener();
        this.active = false;
        const message =
          error instanceof Error ? error.message : 'Sync start failed';
        await this.repository.setSyncState({
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
    return this.stopInternal({
      persistDisabled: true,
      reason: 'explicit_stop',
    });
  }

  private async stopInternal(options: {
    persistDisabled: boolean;
    reason: string;
  }) {
    if (this.stopTask) {
      return this.stopTask;
    }

    this.stopTask = (async () => {
      this.lifecycleEpoch += 1;
      const hadActiveSync = this.active || !!this.startTask;
      let stopError: unknown = null;

      try {
        if (this.startTask) {
          try {
            await this.startTask;
          } catch {
            // Ignore start failures when explicitly stopping.
          }
        }
        await this.bridge.stop();
        if (hadActiveSync) {
          logSyncEvent('info', 'manager', 'stopped', 'Sync stopped.');
        }
      } catch (error) {
        stopError = error;
        logSyncError('manager', 'stop_failed', error);
      } finally {
        // stop should never crash the app; surface failures in logs.
        // (bridge.stop errors will be thrown before finally runs)
        this.clearBridgeSubscriptions();
        this.detachAppStateListener();
        this.active = false;
        this.setHealth({
          ...INITIAL_SYNC_HEALTH,
          lastSyncedAt: this.health.lastSyncedAt,
        });
        if (options.persistDisabled) {
          await this.repository.setSyncState({ syncEnabled: false });
        } else {
          logSyncEvent(
            'info',
            'manager',
            'stop_persist_skipped',
            'Internal stop skipped syncEnabled=false persistence.',
            { reason: options.reason },
          );
        }
        this.stopTask = null;
      }

      if (stopError) {
        throw stopError;
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

  async getAllLogs(): Promise<SyncLogEntry[]> {
    const local = getRecentLogs();
    let backend: SyncBridgeLogEntry[] = [];
    if (this.bridge.pullLogs) {
      try {
        backend = await this.bridge.pullLogs();
      } catch (error) {
        logSyncError('manager', 'pull_logs_failed', error);
      }
    }
    return combineLogs(local, backend as SyncLogEntry[]);
  }

  private attachAppStateListener() {
    if (this.appStateSub) return;
    this.lastAppState = AppState.currentState;
    this.appStateSub = AppState.addEventListener(
      'change',
      this.handleAppStateChange,
    );
  }

  private detachAppStateListener() {
    this.appStateSub?.remove();
    this.appStateSub = null;
  }

  private handleAppStateChange = (next: AppStateStatus) => {
    const prev = this.lastAppState;
    this.lastAppState = next;
    if (prev === next) return;
    logSyncEvent(
      'info',
      'manager',
      'app_state',
      `AppState ${prev} -> ${next}.`,
    );
    if (
      next === 'active' &&
      (prev === 'background' || prev === 'inactive' || prev === 'unknown')
    ) {
      void this.maybeReconnectOnResume();
    }
  };

  private async maybeReconnectOnResume() {
    if (!this.active || this.resuming) return;
    this.resuming = true;
    try {
      logSyncEvent(
        'info',
        'manager',
        'app_resumed',
        'App resumed — probing sync health.',
      );
      const status = this.health.status;
      const dhtReady = this.health.bootstrapped;
      const stale = status === 'error' || status === 'connecting' || !dhtReady;
      if (stale) {
        logSyncEvent(
          'info',
          'manager',
          'force_reconnect',
          'Resume triggered reconnect.',
          { status, dhtReady },
        );
        try {
          await this.stopInternal({
            persistDisabled: false,
            reason: 'resume_reconnect',
          });
        } catch (error) {
          logSyncError('manager', 'resume_stop_failed', error);
        }
        try {
          await this.start();
        } catch (error) {
          logSyncError('manager', 'resume_start_failed', error);
        }
      }
    } finally {
      this.resuming = false;
    }
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

  private clearBridgeSubscriptions() {
    this.unsubscribeStatus?.();
    this.unsubscribeRemoteOp?.();
    this.unsubscribeStatus = null;
    this.unsubscribeRemoteOp = null;
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
