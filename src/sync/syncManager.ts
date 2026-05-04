import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { PearLiftRuntimeState } from '../backup/types';
import type { SyncFirstSyncResolution, SyncRole } from '../storage/types';
import type {
  WorkoutMutation,
  WorkoutRepository,
  WorkoutStoreSnapshot,
} from '../storage';
import { logError } from '../utils/errors';
import { createSyncBridge } from './bridge';
import { canonicalizeMutationForSync } from './canonicalize';
import {
  mergeDisjointRuntime,
  resolveFirstSync,
  summarizeRuntime,
} from './firstSync';
import type { SyncLogEntry } from './logger';
import {
  combineLogs,
  getRecentLogs,
  logSyncError,
  logSyncEvent,
} from './logger';
import type {
  FirstSyncState,
  SyncBridge,
  SyncBridgeLogEntry,
  SyncHealth,
  SyncManager,
  SyncMutation,
  SyncOpEnvelope,
  SyncSnapshotReplacePayload,
} from './types';
import { INITIAL_SYNC_HEALTH } from './types';

const SYNC_SECRET_KEY = 'pearlift.sync.secret';
const EMPTY_ROOM_TIMEOUT_MS = 6000;
const PENDING_RESOLVE_DEBOUNCE_MS = 1000;

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

function toRuntime(snapshot: WorkoutStoreSnapshot | PearLiftRuntimeState) {
  return {
    workouts: snapshot.workouts,
    userWeights: snapshot.userWeights,
    weekConfigs: snapshot.weekConfigs,
    dayConfigs: snapshot.dayConfigs,
    currentWeek: snapshot.currentWeek,
    currentDay: snapshot.currentDay,
    restDuration: snapshot.restDuration,
    themeMode: snapshot.themeMode,
    weightUnit: snapshot.weightUnit,
    language: snapshot.language,
  } satisfies PearLiftRuntimeState;
}

function getOpPayload(
  op: SyncOpEnvelope,
):
  | { kind: 'presence' }
  | { kind: 'mutation'; mutation: SyncMutation }
  | SyncSnapshotReplacePayload {
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

function normalizePairingSecretHex(secretHex: string) {
  return secretHex.trim().toLowerCase();
}

class SyncManagerImpl implements SyncManager {
  private readonly bridge: SyncBridge;
  private readonly repository: WorkoutRepository;
  private readonly healthListeners = new Set<(health: SyncHealth) => void>();
  private readonly remoteAppliedListeners = new Set<() => void>();
  private readonly stateChangeListeners = new Set<() => void>();

  private unsubscribeStatus: (() => void) | null = null;
  private unsubscribeRemoteOp: (() => void) | null = null;

  private active = false;
  private deviceId: string | null = null;
  private currentRole: SyncRole | null = null;
  private pendingLocalRuntime: PearLiftRuntimeState | null = null;
  private bufferedRemoteOps: SyncOpEnvelope[] = [];
  private emptyRoomTimer: ReturnType<typeof setTimeout> | null = null;
  private resolveTimer: ReturnType<typeof setTimeout> | null = null;
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

  onRemoteApplied(cb: () => void) {
    this.remoteAppliedListeners.add(cb);
    return () => {
      this.remoteAppliedListeners.delete(cb);
    };
  }

  onStateChanged(cb: () => void) {
    this.stateChangeListeners.add(cb);
    return () => {
      this.stateChangeListeners.delete(cb);
    };
  }

  async start(input: {
    role: SyncRole;
    pairingSecretHex?: string;
    bootstrapKeyHex?: string;
    localSnapshot: WorkoutStoreSnapshot | null;
  }) {
    if (this.active) return;
    if (this.startTask) return this.startTask;
    if (this.stopTask) await this.stopTask;

    this.startTask = (async () => {
      this.setHealth({ ...this.health, status: 'connecting', lastError: null });

      try {
        const secret =
          input.pairingSecretHex ?? (await loadOrCreatePairingSecret());
        const deviceId = await this.repository.getOrCreateDeviceId();
        const localRuntime = input.localSnapshot
          ? toRuntime(input.localSnapshot)
          : await this.repository.getRuntimeState();
        const syncState = await this.repository.getSyncState();

        this.deviceId = deviceId;
        this.currentRole = input.role;
        this.pendingLocalRuntime = localRuntime;
        this.bufferedRemoteOps = [];

        this.clearBridgeSubscriptions();
        this.unsubscribeStatus = this.bridge.onStatus((health) => {
          this.setHealth({ ...this.health, ...health });
        });
        this.unsubscribeRemoteOp = this.bridge.onRemoteOp((op) => {
          void this.handleRemoteOp(op);
        });

        const started = await this.bridge.start({
          pairingSecretHex: secret,
          deviceId,
          role: input.role,
          bootstrapKeyHex: input.bootstrapKeyHex ?? syncState.autobaseBootstrapKey,
        });

        this.active = true;
        await this.repository.setSyncState({
          syncEnabled: true,
          syncRole: input.role,
          autobaseBootstrapKey:
            input.bootstrapKeyHex ??
            syncState.autobaseBootstrapKey ??
            started.bootstrapKeyHex,
          lastError: null,
        });

        if (input.role === 'creator') {
          await this.persistFirstSyncState({
            roomBindingState: 'active',
            firstSyncResolution:
              summarizeRuntime(localRuntime).workoutCount > 0
                ? 'auto_publish_local'
                : 'unknown',
            pendingLocalSummary: summarizeRuntime(localRuntime),
            pendingRemoteSummary: null,
            pendingConflictSummary: null,
          });

          if (summarizeRuntime(localRuntime).workoutCount > 0) {
            await this.publishSnapshotReplace(
              localRuntime,
              'auto_publish_local',
            );
          }
        } else {
          await this.persistFirstSyncState({
            roomBindingState: 'pending_first_sync',
            firstSyncResolution: 'unknown',
            pendingLocalSummary: summarizeRuntime(localRuntime),
            pendingRemoteSummary: null,
            pendingConflictSummary: null,
          });
          this.scheduleEmptyRoomFallback();
        }

        this.emitStateChanged();
      } catch (error) {
        this.active = false;
        const message =
          error instanceof Error ? error.message : 'Sync start failed';
        await this.repository.setSyncState({ lastError: message });
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
    if (this.stopTask) return this.stopTask;

    this.stopTask = (async () => {
      this.clearTimers();
      try {
        await this.bridge.stop();
      } finally {
        this.clearBridgeSubscriptions();
        this.active = false;
        this.currentRole = null;
        this.pendingLocalRuntime = null;
        this.bufferedRemoteOps = [];
        this.setHealth({
          ...INITIAL_SYNC_HEALTH,
          lastSyncedAt: this.health.lastSyncedAt,
        });
        await this.repository.setSyncState({ syncEnabled: false });
        this.emitStateChanged();
        this.stopTask = null;
      }
    })();

    return this.stopTask;
  }

  async publishLocalMutation(
    mutation: WorkoutMutation,
    snapshot: WorkoutStoreSnapshot | null,
  ) {
    if (!this.active || !this.deviceId) return;

    const canonical = canonicalizeMutationForSync(mutation, snapshot);
    if (!canonical) return;

    const lamport = await this.repository.nextLamport();
    await this.bridge.publish({
      schemaVersion: 1,
      opId: createOpId(this.deviceId, lamport),
      deviceId: this.deviceId,
      lamport,
      createdAt: nowIso(),
      payload: {
        kind: 'mutation',
        mutation: canonical,
      },
    });
  }

  async handleRemoteOp(op: SyncOpEnvelope) {
    if (!this.deviceId) {
      this.deviceId = await this.repository.getOrCreateDeviceId();
    }
    if (op.deviceId === this.deviceId) return;

    const syncState = await this.repository.getSyncState();
    const payload = getOpPayload(op);

    if (
      this.currentRole === 'joiner' &&
      (syncState.roomBindingState === 'pending_first_sync' ||
        syncState.roomBindingState === 'conflict_requires_decision') &&
      payload.kind !== 'presence'
    ) {
      this.bufferedRemoteOps.push(op);
      this.schedulePendingJoinResolution();
      return;
    }

    await this.applyRemoteOp(op);
  }

  async resolveFirstSyncChoice(choice: 'local' | 'remote') {
    const localRuntime =
      this.pendingLocalRuntime ?? (await this.repository.getRuntimeState());

    if (choice === 'local') {
      await this.publishSnapshotReplace(localRuntime, 'local_chosen');
      await this.persistFirstSyncState({
        roomBindingState: 'active',
        firstSyncResolution: 'local_chosen',
        pendingLocalSummary: null,
        pendingRemoteSummary: null,
        pendingConflictSummary: null,
      });
      this.bufferedRemoteOps = [];
      this.emitStateChanged();
      return;
    }

    await this.applyBufferedRemoteOps('remote_chosen');
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

  private schedulePendingJoinResolution() {
    this.clearResolveTimer();
    this.resolveTimer = setTimeout(() => {
      void this.resolvePendingJoin(false);
    }, PENDING_RESOLVE_DEBOUNCE_MS);
  }

  private scheduleEmptyRoomFallback() {
    this.clearEmptyRoomTimer();
    this.emptyRoomTimer = setTimeout(() => {
      void this.resolvePendingJoin(true);
    }, EMPTY_ROOM_TIMEOUT_MS);
  }

  private async resolvePendingJoin(allowEmptyRoomPublish: boolean) {
    const localRuntime =
      this.pendingLocalRuntime ?? (await this.repository.getRuntimeState());
    const latestSnapshotOp = [...this.bufferedRemoteOps]
      .reverse()
      .find((op) => getOpPayload(op).kind === 'snapshot_replace');

    const remoteSnapshotPayload =
      latestSnapshotOp && getOpPayload(latestSnapshotOp).kind === 'snapshot_replace'
        ? (getOpPayload(latestSnapshotOp) as SyncSnapshotReplacePayload)
        : null;

    if (!remoteSnapshotPayload) {
      if (allowEmptyRoomPublish) {
        await this.publishSnapshotReplace(localRuntime, 'auto_publish_local');
        await this.persistFirstSyncState({
          roomBindingState: 'active',
          firstSyncResolution: 'auto_publish_local',
          pendingLocalSummary: null,
          pendingRemoteSummary: null,
          pendingConflictSummary: null,
        });
        this.emitStateChanged();
      } else {
        await this.persistFirstSyncState({
          roomBindingState: 'pending_first_sync',
          pendingLocalSummary: summarizeRuntime(localRuntime),
        });
      }
      return;
    }

    const remoteOpCount = this.bufferedRemoteOps.filter(
      (op) => getOpPayload(op).kind !== 'presence',
    ).length;

    const resolution = resolveFirstSync(
      localRuntime,
      remoteSnapshotPayload.runtime,
      remoteOpCount,
    );

    switch (resolution.kind) {
      case 'auto_import_remote':
        await this.applyBufferedRemoteOps('auto_import_remote');
        return;
      case 'auto_publish_local':
        await this.publishSnapshotReplace(localRuntime, 'auto_publish_local');
        await this.persistFirstSyncState({
          roomBindingState: 'active',
          firstSyncResolution: 'auto_publish_local',
          pendingLocalSummary: null,
          pendingRemoteSummary: null,
          pendingConflictSummary: null,
        });
        this.bufferedRemoteOps = [];
        this.emitStateChanged();
        return;
      case 'auto_merge':
        await this.repository.applyMutation(
          {
            type: 'restoreRuntimeState',
            runtime: resolution.mergedRuntime,
            source: 'migration',
          },
          { origin: 'local', suppressSyncEmit: true },
        );
        await this.publishSnapshotReplace(resolution.mergedRuntime, 'auto_merge');
        await this.persistFirstSyncState({
          roomBindingState: 'active',
          firstSyncResolution: 'auto_merge',
          pendingLocalSummary: null,
          pendingRemoteSummary: null,
          pendingConflictSummary: null,
        });
        this.bufferedRemoteOps = [];
        this.emitRemoteApplied();
        this.emitStateChanged();
        return;
      case 'requires_user_choice':
        await this.persistFirstSyncState({
          roomBindingState: 'conflict_requires_decision',
          firstSyncResolution: 'unknown',
          pendingLocalSummary: resolution.localSummary,
          pendingRemoteSummary: resolution.remoteSummary,
          pendingConflictSummary: resolution.conflictSummary,
        });
        this.emitStateChanged();
        return;
    }
  }

  private async applyBufferedRemoteOps(
    resolution: Exclude<
      SyncFirstSyncResolution,
      'unknown' | 'auto_publish_local' | 'auto_merge' | 'local_chosen'
    >,
  ) {
    for (const op of this.bufferedRemoteOps) {
      await this.applyRemoteOp(op);
    }
    this.bufferedRemoteOps = [];
    await this.persistFirstSyncState({
      roomBindingState: 'active',
      firstSyncResolution: resolution,
      pendingLocalSummary: null,
      pendingRemoteSummary: null,
      pendingConflictSummary: null,
    });
    this.emitStateChanged();
  }

  private async applyRemoteOp(op: SyncOpEnvelope) {
    const payload = getOpPayload(op);

    if (payload.kind === 'presence') {
      await this.repository.markSyncOpApplied({
        opId: op.opId,
        deviceId: op.deviceId,
        lamport: op.lamport,
      });
      this.setHealth({
        ...this.health,
        status: 'synced',
        lastSyncedAt: nowIso(),
        lastError: null,
      });
      return;
    }

    if (payload.kind === 'snapshot_replace') {
      await this.repository.applyMutation(
        {
          type: 'restoreRuntimeState',
          runtime: payload.runtime,
          source: 'migration',
        },
        {
          origin: 'remote',
          opId: op.opId,
          deviceId: op.deviceId,
          lamport: op.lamport,
          suppressSyncEmit: true,
        },
      );
    } else {
      await this.repository.applyMutation(payload.mutation, {
        origin: 'remote',
        opId: op.opId,
        deviceId: op.deviceId,
        lamport: op.lamport,
        suppressSyncEmit: true,
      });
    }

    this.setHealth({
      ...this.health,
      status: 'synced',
      lastSyncedAt: nowIso(),
      lastError: null,
    });
    this.emitRemoteApplied();
  }

  private async publishSnapshotReplace(
    runtime: PearLiftRuntimeState,
    resolution: SyncFirstSyncResolution,
  ) {
    if (!this.deviceId) return;
    const lamport = await this.repository.nextLamport();
    await this.bridge.publish({
      schemaVersion: 1,
      opId: createOpId(this.deviceId, lamport),
      deviceId: this.deviceId,
      lamport,
      createdAt: nowIso(),
      payload: {
        kind: 'snapshot_replace',
        runtime,
        summary: summarizeRuntime(runtime),
      },
    });

    await this.persistFirstSyncState({
      roomBindingState: 'active',
      firstSyncResolution: resolution,
      pendingLocalSummary: null,
      pendingRemoteSummary: null,
      pendingConflictSummary: null,
    });
  }

  private async persistFirstSyncState(
    patch: Partial<Awaited<ReturnType<WorkoutRepository['getSyncState']>>>,
  ) {
    await this.repository.setSyncState(patch);
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

  private emitRemoteApplied() {
    for (const listener of this.remoteAppliedListeners) {
      listener();
    }
  }

  private emitStateChanged() {
    for (const listener of this.stateChangeListeners) {
      listener();
    }
  }

  private clearResolveTimer() {
    if (!this.resolveTimer) return;
    clearTimeout(this.resolveTimer);
    this.resolveTimer = null;
  }

  private clearEmptyRoomTimer() {
    if (!this.emptyRoomTimer) return;
    clearTimeout(this.emptyRoomTimer);
    this.emptyRoomTimer = null;
  }

  private clearTimers() {
    this.clearResolveTimer();
    this.clearEmptyRoomTimer();
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

export async function setPairingSecretPayload(secretHex: string): Promise<void> {
  const normalized = normalizePairingSecretHex(secretHex);
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('Pairing secret must be 64 hex characters.');
  }
  await SecureStore.setItemAsync(SYNC_SECRET_KEY, normalized);
}

export async function clearPairingSecret(): Promise<void> {
  await SecureStore.deleteItemAsync(SYNC_SECRET_KEY);
}
