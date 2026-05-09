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
import { coalescePublishQueue } from './coalesce';
import {
  cloneRuntime,
  getOpPayload,
  mutationsConflict,
  applyOpsToRuntimePreview,
} from './conflicts';
import {
  buildConflictSummary,
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
import {
  clearPairingSecret,
  getPairingSecretPayload,
  loadOrCreatePairingSecret,
  setPairingSecretPayload,
  toHex,
} from './secrets';
import type {
  FirstSyncState,
  SyncBridge,
  SyncDeviceProfilePayload,
  SyncBridgeLogEntry,
  SyncHealth,
  SyncManager,
  SyncMutation,
  SyncOpEnvelope,
  SyncSnapshotReplacePayload,
} from './types';
import { INITIAL_SYNC_HEALTH } from './types';

export { getPairingSecretPayload, setPairingSecretPayload, clearPairingSecret };

const EMPTY_ROOM_TIMEOUT_MS = 6000;
const PENDING_RESOLVE_DEBOUNCE_MS = 1000;
const PUBLISH_DEBOUNCE_MS = 200;
const RECONNECT_RECONCILE_MS = 1500;

function nowIso() {
  return new Date().toISOString();
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

function preserveLocalPreferences(
  incoming: PearLiftRuntimeState,
  local: PearLiftRuntimeState,
): PearLiftRuntimeState {
  return {
    ...incoming,
    currentWeek: local.currentWeek,
    currentDay: local.currentDay,
    restDuration: local.restDuration,
    themeMode: local.themeMode,
    weightUnit: local.weightUnit,
    language: local.language,
  };
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
  private currentBootstrapKeyHex: string | null = null;
  private pendingLocalRuntime: PearLiftRuntimeState | null = null;
  private bufferedRemoteOps: SyncOpEnvelope[] = [];
  private pendingReconnectLocalMutations: SyncMutation[] = [];
  private pendingPublishQueue: SyncMutation[] = [];
  private emptyRoomTimer: ReturnType<typeof setTimeout> | null = null;
  private resolveTimer: ReturnType<typeof setTimeout> | null = null;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
        this.currentBootstrapKeyHex =
          input.bootstrapKeyHex ?? syncState.autobaseBootstrapKey ?? null;
        this.pendingLocalRuntime = localRuntime;
        this.bufferedRemoteOps = [];
        this.pendingReconnectLocalMutations =
          syncState.roomBindingState === 'active'
            ? await this.repository.getPendingLocalSyncMutations()
            : [];
        this.clearPendingPublishes();

        this.clearBridgeSubscriptions();
        this.unsubscribeStatus = this.bridge.onStatus((health) => {
          this.setHealth({ ...this.health, ...health });
        });
        this.unsubscribeRemoteOp = this.bridge.onRemoteOp((op) => {
          void this.handleRemoteOp(op);
        });

        const requestedBootstrapKey =
          input.bootstrapKeyHex ?? syncState.autobaseBootstrapKey ?? null;
        logSyncEvent('info', 'manager', 'start_requested', 'Starting sync.', {
          role: input.role,
          requestedBootstrapKey,
        });

        const started = await this.bridge.start({
          pairingSecretHex: secret,
          deviceId,
          role: input.role,
          bootstrapKeyHex: requestedBootstrapKey,
        });

        if (
          requestedBootstrapKey &&
          started.bootstrapKeyHex &&
          started.bootstrapKeyHex !== requestedBootstrapKey
        ) {
          throw new Error(
            `Sync room mismatch: opened ${started.bootstrapKeyHex}, expected ${requestedBootstrapKey}.`,
          );
        }

        this.active = true;
        await this.repository.setSyncState({
          syncEnabled: true,
          syncRole: input.role,
          autobaseBootstrapKey:
            requestedBootstrapKey ?? started.bootstrapKeyHex,
          lastError: null,
        });

        await this.publishDeviceProfile(
          await this.repository.getLocalDeviceDisplayName(),
        );

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

        this.scheduleReconnectPublish();

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
        await this.flushPendingPublishes().catch((error) => {
          logSyncError('manager', 'publish_flush_before_stop_failed', error);
        });
        await this.bridge.stop();
      } finally {
        this.clearBridgeSubscriptions();
        this.active = false;
        this.currentRole = null;
        this.currentBootstrapKeyHex = null;
        this.pendingLocalRuntime = null;
        this.bufferedRemoteOps = [];
        this.pendingReconnectLocalMutations = [];
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
    if (!this.active || !this.deviceId) {
      logSyncEvent(
        'info',
        'manager',
        'publish_skipped_inactive',
        'Skipping local sync publish while inactive.',
        { type: mutation.type },
      );
      return;
    }

    const canonical = canonicalizeMutationForSync(mutation, snapshot);
    if (!canonical) {
      logSyncEvent(
        'info',
        'manager',
        'publish_skipped_unsyncable',
        'Skipping unsyncable local mutation.',
        { type: mutation.type },
      );
      return;
    }

    this.enqueuePublish(canonical);
  }

  private enqueuePublish(mutation: SyncMutation) {
    if (!this.active || !this.deviceId) {
      this.clearPendingPublishes();
      return;
    }

    this.pendingPublishQueue = coalescePublishQueue(
      this.pendingPublishQueue,
      mutation,
    );
    logSyncEvent('info', 'manager', 'publish_queued', 'Sync op queued.', {
      type: mutation.type,
      queued: this.pendingPublishQueue.length,
    });

    this.clearPublishTimer();
    this.publishTimer = setTimeout(() => {
      void this.flushPendingPublishes().catch((error) => {
        logSyncError('manager', 'publish_flush_failed', error);
      });
    }, PUBLISH_DEBOUNCE_MS);
  }

  private async flushPendingPublishes() {
    this.clearPublishTimer();
    if (!this.active || !this.deviceId) {
      this.clearPendingPublishes();
      return;
    }

    const queue = this.pendingPublishQueue;
    this.pendingPublishQueue = [];
    if (queue.length === 0) return;

    logSyncEvent('info', 'manager', 'publish_flush', 'Flushing sync ops.', {
      count: queue.length,
    });

    for (const mutation of queue) {
      await this.publishMutationNow(mutation);
    }
  }

  private async publishMutationNow(mutation: SyncMutation) {
    if (!this.active || !this.deviceId) return;
    const lamport = await this.repository.nextLamport();
    await this.bridge.publish({
      schemaVersion: 1,
      opId: createOpId(this.deviceId, lamport),
      deviceId: this.deviceId,
      lamport,
      createdAt: nowIso(),
      payload: {
        kind: 'mutation',
        mutation,
      },
    });
  }

  async handleRemoteOp(op: SyncOpEnvelope) {
    if (!this.deviceId) {
      this.deviceId = await this.repository.getOrCreateDeviceId();
    }
    if (op.deviceId === this.deviceId) {
      logSyncEvent('info', 'manager', 'remote_skip_self', 'Skipping own op.', {
        opId: op.opId,
      });
      return;
    }

    const syncState = await this.repository.getSyncState();
    const payload = getOpPayload(op);

    if (
      this.currentRole === 'joiner' &&
      (syncState.roomBindingState === 'pending_first_sync' ||
        syncState.roomBindingState === 'conflict_requires_decision') &&
      payload.kind !== 'presence'
    ) {
      this.bufferedRemoteOps.push(op);
      logSyncEvent(
        'info',
        'manager',
        'remote_buffered',
        'Buffered remote op pending first-sync resolution.',
        { opId: op.opId, kind: payload.kind },
      );
      this.schedulePendingJoinResolution();
      return;
    }

    if (
      syncState.roomBindingState === 'active_conflict_requires_decision' &&
      payload.kind !== 'presence' &&
      payload.kind !== 'device_profile'
    ) {
      this.bufferedRemoteOps.push(op);
      logSyncEvent(
        'info',
        'manager',
        'remote_buffered_active_conflict',
        'Buffered remote op pending active-room conflict resolution.',
        { opId: op.opId, kind: payload.kind },
      );
      return;
    }

    if (
      syncState.roomBindingState === 'active' &&
      this.pendingReconnectLocalMutations.length > 0 &&
      payload.kind !== 'presence' &&
      payload.kind !== 'device_profile'
    ) {
      const conflict = await this.tryEnterActiveConflict(op, payload);
      if (conflict) {
        return;
      }
    }

    await this.applyRemoteOp(op);
  }

  async resolveFirstSyncChoice(choice: 'local' | 'remote') {
    const localRuntime =
      this.pendingLocalRuntime ?? (await this.repository.getRuntimeState());

    if (choice === 'local') {
      await this.publishSnapshotReplace(localRuntime, 'local_chosen');
      await this.repository.clearPendingLocalSyncMutations();
      this.pendingReconnectLocalMutations = [];
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
    await this.repository.clearPendingLocalSyncMutations();
    this.pendingReconnectLocalMutations = [];
  }

  getHealth() {
    return this.health;
  }

  async publishDeviceProfile(displayName: string) {
    if (!this.active || !this.deviceId) return;
    const normalized = displayName.trim();
    if (!normalized) return;
    const lamport = await this.repository.nextLamport();
    await this.bridge.publish({
      schemaVersion: 1,
      opId: createOpId(this.deviceId, lamport),
      deviceId: this.deviceId,
      lamport,
      createdAt: nowIso(),
      payload: {
        kind: 'device_profile',
        profile: {
          deviceId: this.deviceId,
          displayName: normalized,
          writerKey: this.health.localWriterKey,
        },
      },
    });
  }

  async leaveRoom() {
    this.clearPendingPublishes();
    await this.stop();
    await this.bridge.clearStorage();
    await this.repository.leaveSyncRoom();
    this.emitStateChanged();
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

  private scheduleReconnectPublish() {
    this.clearReconnectTimer();
    if (!this.active || this.pendingReconnectLocalMutations.length === 0) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      void this.flushPendingReconnectLocalMutations().catch((error) => {
        logSyncError('manager', 'reconnect_flush_failed', error);
      });
    }, RECONNECT_RECONCILE_MS);
  }

  private async flushPendingReconnectLocalMutations() {
    this.clearReconnectTimer();
    if (!this.active || this.pendingReconnectLocalMutations.length === 0) {
      return;
    }
    const queue = [...this.pendingReconnectLocalMutations];
    this.pendingReconnectLocalMutations = [];
    for (const mutation of queue) {
      await this.publishMutationNow(mutation);
    }
    await this.repository.clearPendingLocalSyncMutations();
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
        if (this.currentRole === 'joiner' && this.currentBootstrapKeyHex) {
          logSyncEvent(
            'info',
            'manager',
            'join_waiting_for_snapshot',
            'Explicit room join is still waiting for room data.',
          );
          await this.persistFirstSyncState({
            roomBindingState: 'pending_first_sync',
            pendingLocalSummary: summarizeRuntime(localRuntime),
          });
          this.emitStateChanged();
          return;
        }
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
      case 'already_in_sync':
        if (remoteOpCount > 1) {
          await this.applyBufferedRemoteOps('auto_import_remote');
          return;
        }
        await this.persistFirstSyncState({
          roomBindingState: 'active',
          firstSyncResolution: 'auto_merge',
          pendingLocalSummary: null,
          pendingRemoteSummary: null,
          pendingConflictSummary: null,
        });
        this.bufferedRemoteOps = [];
        this.emitStateChanged();
        return;
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

  private async tryEnterActiveConflict(
    op: SyncOpEnvelope,
    payload: ReturnType<typeof getOpPayload>,
  ) {
    const localRuntime = await this.repository.getRuntimeState();
    const hasConflict =
      payload.kind === 'snapshot_replace'
        ? buildConflictSummary(
            summarizeRuntime(localRuntime),
            payload.summary,
            this.pendingReconnectLocalMutations.length,
          ).requiresManualChoice
        : payload.kind === 'mutation' &&
          this.pendingReconnectLocalMutations.some((mutation) =>
            mutationsConflict(mutation, payload.mutation),
          );

    if (!hasConflict) {
      return false;
    }

    this.clearReconnectTimer();
    this.bufferedRemoteOps.push(op);
    const remoteRuntime =
      payload.kind === 'snapshot_replace'
        ? payload.runtime
        : applyOpsToRuntimePreview(localRuntime, this.bufferedRemoteOps, getOpPayload);
    const localSummary = summarizeRuntime(localRuntime);
    const remoteSummary = summarizeRuntime(remoteRuntime);
    const conflictSummary = buildConflictSummary(
      localSummary,
      remoteSummary,
      this.pendingReconnectLocalMutations.length + this.bufferedRemoteOps.length,
    );

    await this.persistFirstSyncState({
      roomBindingState: 'active_conflict_requires_decision',
      firstSyncResolution: 'unknown',
      pendingLocalSummary: localSummary,
      pendingRemoteSummary: remoteSummary,
      pendingConflictSummary: conflictSummary,
    });
    logSyncEvent(
      'warn',
      'manager',
      'active_conflict_requires_decision',
      'Paused remote sync application due to conflicting offline edits.',
      {
        opId: op.opId,
        pendingLocalCount: this.pendingReconnectLocalMutations.length,
        bufferedRemoteCount: this.bufferedRemoteOps.length,
      },
    );
    this.emitStateChanged();
    return true;
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
    logSyncEvent('info', 'manager', 'remote_apply', 'Applying remote op.', {
      opId: op.opId,
      kind: payload.kind,
      type: payload.kind === 'mutation' ? payload.mutation.type : undefined,
    });

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

    if (payload.kind === 'device_profile') {
      await this.repository.upsertSyncedDevice({
        ...payload.profile,
        lastSeen: nowIso(),
      });
      await this.repository.markSyncOpApplied({
        opId: op.opId,
        deviceId: op.deviceId,
        lamport: op.lamport,
        displayName: payload.profile.displayName,
        writerKey: payload.profile.writerKey ?? null,
      });
      this.emitRemoteApplied();
      return;
    }

    if (payload.kind === 'snapshot_replace') {
      const localRuntime = await this.repository.getRuntimeState();
      await this.repository.applyMutation(
        {
          type: 'restoreRuntimeState',
          runtime: preserveLocalPreferences(payload.runtime, localRuntime),
          source: 'migration',
        },
        {
          origin: 'remote',
          opId: op.opId,
          deviceId: op.deviceId,
          lamport: op.lamport,
          createdAt: op.createdAt,
          suppressSyncEmit: true,
        },
      );
    } else {
      await this.repository.applyMutation(payload.mutation, {
        origin: 'remote',
        opId: op.opId,
        deviceId: op.deviceId,
        lamport: op.lamport,
        createdAt: op.createdAt,
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
    this.clearPublishTimer();
    this.clearReconnectTimer();
  }

  private clearPublishTimer() {
    if (!this.publishTimer) return;
    clearTimeout(this.publishTimer);
    this.publishTimer = null;
  }

  private clearPendingPublishes() {
    this.clearPublishTimer();
    this.pendingPublishQueue = [];
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
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
