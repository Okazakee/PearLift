import type { PearLiftRuntimeState } from '@/backup/types';
import type { SyncFirstSyncResolution, SyncRole } from '@/storage/types';
import type {
  WorkoutMutation,
  WorkoutRepository,
  WorkoutStoreSnapshot,
} from '@/storage';
import { logError } from '@/utils/errors';
import { HolepunchWorkletBridge } from '@/sync/holepunchBridge';
import { buildHealthSignature } from '@/sync/manager/health';
import { classifyStartError } from '@/sync/manager/lifecycle';
import {
  createOpId,
  EMPTY_ROOM_TIMEOUT_MS,
  MAX_BUFFERED_REMOTE_OPS,
  nowIso,
  PENDING_RESOLVE_DEBOUNCE_MS,
  PUBLISH_DEBOUNCE_MS,
  preserveLocalPreferences,
  RECONNECT_RECONCILE_MS,
  summarizeRoomBindingState,
  toRuntime,
} from '@/sync/manager/state';
import { clearTimer } from '@/sync/manager/timers';
import { canonicalizeMutationForSync } from '@/sync/canonicalize';
import { coalescePublishQueue } from '@/sync/coalesce';
import {
  getOpPayload,
} from '@/sync/conflicts';
import {
  buildConflictSummary,
  mergeDisjointRuntime,
  resolveFirstSync,
  summarizeRuntime,
} from '@/sync/firstSync';
import type { SyncLogEntry } from '@/sync/logger';
import {
  combineLogs,
  getRecentLogs,
  logSyncError,
  logSyncEvent,
  resetSyncLogDeviceTagToRuntime,
  setSyncLogDeviceTag,
} from '@/sync/logger';
import {
  clearPairingSecret,
  getPairingSecretPayload,
  loadOrCreatePairingSecret,
  setPairingSecretPayload,
  toHex,
} from '@/sync/secrets';
import type {
  FirstSyncState,
  SyncBridge,
  SyncDeviceProfilePayload,
  SyncBridgeLogEntry,
  SyncHealth,
  SyncManager,
  SyncMutation,
  SyncOpEnvelope,
} from '@/sync/types';
import { INITIAL_SYNC_HEALTH } from '@/sync/types';
import { buildRuntimeFromSyncView, buildSyncViewProjection, isSharedSyncOp } from '@/sync/viewReplay';

export { getPairingSecretPayload, setPairingSecretPayload, clearPairingSecret };

class SyncManagerImpl implements SyncManager {
  private readonly bridge: SyncBridge;
  private readonly repository: WorkoutRepository;
  private readonly healthListeners = new Set<(health: SyncHealth) => void>();
  private readonly remoteAppliedListeners = new Set<() => void>();
  private readonly stateChangeListeners = new Set<() => void>();

  private unsubscribeStatus: (() => void) | null = null;
  private unsubscribeViewChanged: (() => void) | null = null;

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
  private pendingDeviceProfileFlushInFlight = false;
  private bridgeStartResolved = false;
  private viewSyncTask: Promise<void> | null = null;
  private queuedViewSyncReason: string | null = null;
  private health: SyncHealth = { ...INITIAL_SYNC_HEALTH };
  private lastLoggedHealthSignature: string | null = null;

  constructor(repository: WorkoutRepository, bridge?: SyncBridge) {
    this.repository = repository;
    this.bridge = bridge ?? new HolepunchWorkletBridge();
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
    dhtBootstrap?: { host: string; port: number } | null;
    localSnapshot: WorkoutStoreSnapshot | null;
  }) {
    if (this.active) return;
    if (this.startTask) return this.startTask;
    if (this.stopTask) await this.stopTask;

    this.startTask = (async () => {
      resetSyncLogDeviceTagToRuntime();
      logSyncEvent(
        'info',
        'manager',
        'start_init',
        'Initializing sync start sequence.',
      );
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
        setSyncLogDeviceTag(deviceId);
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
          const previousHealth = this.health;
          const mergedHealth = { ...previousHealth, ...health };
          this.logHealthFromBridge(this.health, mergedHealth);
          this.setHealth(mergedHealth);
          if (
            this.currentRole === 'creator' &&
            previousHealth.connections === 0 &&
            mergedHealth.connections > 0
          ) {
            void this.republishCreatorSnapshotOnPeerConnect();
          }
          if (
            mergedHealth.status === 'synced' ||
            mergedHealth.status === 'peer_connected' ||
            mergedHealth.status === 'replicating'
          ) {
            void this.flushPendingDeviceProfilePublish('status');
          }
        });
        this.unsubscribeViewChanged = this.bridge.onViewChanged(() => {
          this.scheduleViewSync('view_changed');
        });
        logSyncEvent(
          'info',
          'manager',
          'bridge_subscriptions_ready',
          'Bridge subscriptions established.',
        );

        const requestedBootstrapKey =
          input.bootstrapKeyHex ?? syncState.autobaseBootstrapKey ?? null;
        logSyncEvent('info', 'manager', 'start_requested', 'Starting sync.', {
          role: input.role,
          requestedBootstrapKey,
        });

        this.bridgeStartResolved = false;
        const started = await this.bridge.start({
          pairingSecretHex: secret,
          deviceId,
          role: input.role,
          bootstrapKeyHex: requestedBootstrapKey,
          dhtBootstrap: input.dhtBootstrap ?? null,
        });
        this.bridgeStartResolved = true;

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
        logSyncEvent(
          'info',
          'manager',
          'start_backend_ready',
          'Sync backend accepted start request.',
          {
            role: input.role,
            requestedBootstrapKey,
            openedBootstrapKey: started.bootstrapKeyHex || null,
            deviceId,
          },
        );
        await this.repository.setSyncState({
          syncEnabled: true,
          syncRole: input.role,
          autobaseBootstrapKey:
            requestedBootstrapKey ?? started.bootstrapKeyHex,
          lastError: null,
        });

        const openedBootstrapKey =
          requestedBootstrapKey ?? started.bootstrapKeyHex ?? null;

        try {
          await this.publishDeviceProfile(
            await this.repository.getLocalDeviceDisplayName(),
          );
          await this.repository.clearPendingDeviceProfileDisplayName();
        } catch (error) {
          const localDisplayName =
            await this.repository.getLocalDeviceDisplayName();
          await this.repository.setPendingDeviceProfileDisplayName(
            localDisplayName,
          );
          logSyncError('manager', 'profile_publish_on_start_failed', error, {
            displayName: localDisplayName,
          });
        }
        void this.flushPendingDeviceProfilePublish('start');

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
          const shouldPreserveJoinState =
            syncState.autobaseBootstrapKey &&
            openedBootstrapKey &&
            syncState.autobaseBootstrapKey === openedBootstrapKey &&
            syncState.roomBindingState !== 'unconfigured';

          if (shouldPreserveJoinState) {
            logSyncEvent(
              'info',
              'manager',
              'join_state_resumed',
              'Resuming existing join room state.',
              {
                roomBindingState: syncState.roomBindingState,
                firstSyncResolution: syncState.firstSyncResolution,
                openedBootstrapKey,
              },
            );

            if (
              syncState.roomBindingState === 'pending_first_sync' ||
              syncState.roomBindingState === 'conflict_requires_decision'
            ) {
              this.scheduleEmptyRoomFallback();
            }
          } else {
            await this.persistFirstSyncState({
              roomBindingState: 'pending_first_sync',
              firstSyncResolution: 'unknown',
              pendingLocalSummary: summarizeRuntime(localRuntime),
              pendingRemoteSummary: null,
              pendingConflictSummary: null,
            });
            logSyncEvent(
              'info',
              'manager',
              'join_state_initialized',
              'Initialized join room state for first sync.',
              {
                openedBootstrapKey,
                previousRoomBindingState: syncState.roomBindingState,
                previousBootstrapKey: syncState.autobaseBootstrapKey,
              },
            );
            this.scheduleEmptyRoomFallback();
          }

        }

        this.scheduleViewSync('start_ready');
        this.scheduleReconnectPublish();

        this.emitStateChanged();
      } catch (error) {
        this.bridgeStartResolved = false;
        this.active = false;
        const rawMessage =
          error instanceof Error ? error.message : 'Sync start failed';
        const classified = classifyStartError(rawMessage);
        logSyncError('manager', 'start_failed', error, {
          startCategory: classified.category,
          rawMessage,
        });
        await this.repository.setSyncState({
          lastError: classified.userMessage,
        });
        this.setHealth({
          ...this.health,
          status: 'error',
          lastError: classified.userMessage,
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
        this.bridgeStartResolved = false;
        this.clearBridgeSubscriptions();
        this.active = false;
        this.currentRole = null;
        this.currentBootstrapKeyHex = null;
        this.pendingLocalRuntime = null;
        this.bufferedRemoteOps = [];
        this.pendingReconnectLocalMutations = [];
        this.viewSyncTask = null;
        this.queuedViewSyncReason = null;
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

    if (mutation.type === 'restoreRuntimeState') {
      await this.publishSnapshotReplace(mutation.runtime, 'auto_publish_local');
      logSyncEvent(
        'info',
        'manager',
        'backup_import_snapshot_publish',
        'Published full snapshot after backup import.',
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

    if (this.currentRole === 'creator' && this.health.connections > 0) {
      const pairedDevices = await this.repository.getPairedDevices();
      if (pairedDevices.length === 0) {
        const runtime = snapshot
          ? toRuntime(snapshot)
          : await this.repository.getRuntimeState();
        await this.publishSnapshotReplace(runtime, 'auto_publish_local');
        logSyncEvent(
          'info',
          'manager',
          'creator_snapshot_bootstrap_publish',
          'Published full snapshot because no synced peer profile is known yet.',
          {
            type: mutation.type,
            connections: this.health.connections,
          },
        );
        return;
      }
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

  private checkBufferOverflow() {
    if (this.bufferedRemoteOps.length <= MAX_BUFFERED_REMOTE_OPS) return;

    logSyncEvent(
      'warn',
      'manager',
      'buffer_overflow',
      'Buffered sync view exceeded the historical advisory limit.',
      {
        bufferedCount: this.bufferedRemoteOps.length,
        limit: MAX_BUFFERED_REMOTE_OPS,
      },
    );
  }

  async resolveFirstSyncChoice(choice: 'local' | 'remote' | 'merge') {
    const localRuntime =
      this.pendingLocalRuntime ?? (await this.repository.getRuntimeState());
    const remoteSharedOps = this.bufferedRemoteOps.filter(isSharedSyncOp);
    const remoteRuntime = buildRuntimeFromSyncView(remoteSharedOps);

    if (choice === 'merge') {
      const merged = mergeDisjointRuntime(localRuntime, remoteRuntime);
      await this.repository.applyMutation(
        {
          type: 'restoreRuntimeState',
          runtime: merged,
          source: 'migration',
        },
        { origin: 'local', suppressSyncEmit: true },
      );
      await this.publishSnapshotReplace(merged, 'merge_chosen');
      await this.repository.clearPendingLocalSyncMutations();
      this.pendingReconnectLocalMutations = [];
      this.bufferedRemoteOps = [];
      this.emitStateChanged();
      return;
    }

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

  async flushPendingDeviceProfilePublish(reason: 'start' | 'status') {
    if (
      !this.active ||
      !this.deviceId ||
      !this.bridgeStartResolved ||
      this.pendingDeviceProfileFlushInFlight
    ) {
      return;
    }
    this.pendingDeviceProfileFlushInFlight = true;
    try {
      const pending = await this.repository.getPendingDeviceProfileDisplayName();
      if (!pending) {
        return;
      }
      await this.publishDeviceProfile(pending);
      await this.repository.clearPendingDeviceProfileDisplayName();
      logSyncEvent(
        'info',
        'manager',
        'profile_publish_retry_success',
        'Pending device profile publish flushed.',
        { reason },
      );
    } catch (error) {
      logSyncError('manager', 'profile_publish_retry_failed', error, {
        reason,
      });
    } finally {
      this.pendingDeviceProfileFlushInFlight = false;
    }
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
    return combineLogs(
      local,
      backend.map((entry) => ({
        ...entry,
        deviceTag: entry.deviceTag || 'unknown',
      })),
    );
  }

  private scheduleViewSync(reason: string) {
    if (!this.active) {
      return;
    }
    if (this.viewSyncTask) {
      this.queuedViewSyncReason = reason;
      return;
    }

    this.viewSyncTask = this.syncCurrentView(reason).finally(() => {
      this.viewSyncTask = null;
      if (!this.queuedViewSyncReason) {
        return;
      }
      const queuedReason = this.queuedViewSyncReason;
      this.queuedViewSyncReason = null;
      this.scheduleViewSync(queuedReason);
    });
  }

  private async syncCurrentView(reason: string) {
    if (!this.active) {
      return;
    }

    const ops = await this.bridge.getCurrentView();
    const projection = buildSyncViewProjection(ops);
    const syncState = await this.repository.getSyncState();

    logSyncEvent(
      'info',
      'manager',
      'view_sync_begin',
      'Reconciling current ordered sync view.',
      {
        reason,
        roomBindingState: syncState.roomBindingState,
        totalOps: ops.length,
        sharedOpCount: projection.sharedOpCount,
        pendingReconnectCount: this.pendingReconnectLocalMutations.length,
      },
    );

    if (
      syncState.roomBindingState === 'pending_first_sync' ||
      syncState.roomBindingState === 'conflict_requires_decision'
    ) {
      this.bufferedRemoteOps = ops;
      this.schedulePendingJoinResolution();
      this.checkBufferOverflow();
      return;
    }

    if (syncState.roomBindingState === 'active_conflict_requires_decision') {
      this.bufferedRemoteOps = ops;
      return;
    }

    if (projection.sharedOpCount === 0) {
      return;
    }

    if (
      syncState.roomBindingState === 'active' &&
      this.pendingReconnectLocalMutations.length > 0
    ) {
      const localRuntime = await this.repository.getRuntimeState();
      const localSummary = summarizeRuntime(localRuntime);
      const remoteSummary = summarizeRuntime(projection.runtime);
      const conflictSummary = buildConflictSummary(
        localSummary,
        remoteSummary,
        this.pendingReconnectLocalMutations.length,
      );

      if (conflictSummary.requiresManualChoice) {
        this.clearReconnectTimer();
        this.bufferedRemoteOps = ops;
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
          'Paused sync view reconciliation due to conflicting offline edits.',
          {
            pendingLocalCount: this.pendingReconnectLocalMutations.length,
            bufferedRemoteCount: this.bufferedRemoteOps.length,
            reason,
          },
        );
        this.emitStateChanged();
      } else {
        this.scheduleReconnectPublish();
      }
      return;
    }

    const localRuntime = await this.repository.getRuntimeState();
    await this.repository.replaceSyncProjection({
      ...projection,
      runtime: preserveLocalPreferences(projection.runtime, localRuntime),
    });
    this.setHealth({
      ...this.health,
      status: 'synced',
      lastSyncedAt: nowIso(),
      lastError: null,
    });
    this.emitRemoteApplied();
  }

  private schedulePendingJoinResolution() {
    this.clearResolveTimer();
    logSyncEvent(
      'info',
      'manager',
      'join_resolution_scheduled',
      'Scheduled pending join resolution.',
      {
        bufferedCount: this.bufferedRemoteOps.length,
        debounceMs: PENDING_RESOLVE_DEBOUNCE_MS,
      },
    );
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
    const syncState = await this.repository.getSyncState();
    const projection = buildSyncViewProjection(this.bufferedRemoteOps);
    const remoteSummary =
      projection.sharedOpCount > 0
        ? summarizeRuntime(projection.runtime)
        : null;

    logSyncEvent(
      'info',
      'manager',
      'join_resolution_attempt',
      'Attempting pending join resolution.',
      {
        allowEmptyRoomPublish,
        currentRole: this.currentRole,
        currentBootstrapKeyHex: this.currentBootstrapKeyHex,
        bufferedCount: this.bufferedRemoteOps.length,
        remoteOpKinds: this.bufferedRemoteOps.map((op) => getOpPayload(op).kind),
        ...summarizeRoomBindingState(syncState),
      },
    );

    if (projection.sharedOpCount === 0) {
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
          logSyncEvent(
            'info',
            'manager',
            'join_resolution_deferred',
            'Join resolution deferred because no remote snapshot is available yet.',
            {
              allowEmptyRoomPublish,
              reason: 'joiner_waiting_for_snapshot',
              bufferedCount: this.bufferedRemoteOps.length,
            },
          );
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
        logSyncEvent(
          'info',
          'manager',
          'join_resolution_auto_publish_local',
          'Published local snapshot because room appeared empty.',
          {
            allowEmptyRoomPublish,
            bufferedCount: this.bufferedRemoteOps.length,
          },
        );
        this.emitStateChanged();
      } else {
        await this.persistFirstSyncState({
          roomBindingState: 'pending_first_sync',
          pendingLocalSummary: summarizeRuntime(localRuntime),
        });
        logSyncEvent(
          'info',
          'manager',
          'join_resolution_waiting',
          'Pending join resolution is still waiting for a remote snapshot.',
          {
            allowEmptyRoomPublish,
            bufferedCount: this.bufferedRemoteOps.length,
          },
        );
      }
      return;
    }

    const resolution = resolveFirstSync(
      localRuntime,
      projection.runtime,
      projection.sharedOpCount,
    );

    logSyncEvent(
      'info',
      'manager',
      'join_resolution_decided',
      'Resolved pending join strategy.',
      {
        resolution: resolution.kind,
        remoteOpCount: projection.sharedOpCount,
        bufferedCount: this.bufferedRemoteOps.length,
      },
    );

    switch (resolution.kind) {
      case 'already_in_sync':
        if (projection.sharedOpCount > 0) {
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
        try {
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
        } catch (error) {
          logSyncError('manager', 'auto_merge_failed', error);
          await this.persistFirstSyncState({
            roomBindingState: 'conflict_requires_decision',
            firstSyncResolution: 'unknown',
            pendingLocalSummary: resolution.localSummary,
            pendingRemoteSummary: resolution.remoteSummary,
            pendingConflictSummary: buildConflictSummary(
              resolution.localSummary,
              resolution.remoteSummary,
              projection.sharedOpCount,
            ),
          });
          logSyncEvent(
            'warn',
            'manager',
            'auto_merge_fallback',
            'Auto-merge assertion failed, falling back to user choice.',
          );
          this.emitStateChanged();
        }
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
    const localRuntime = await this.repository.getRuntimeState();
    const projection = buildSyncViewProjection(this.bufferedRemoteOps);

    logSyncEvent(
      'info',
      'manager',
      'buffer_drain_begin',
      'Applying buffered remote ops.',
      {
        resolution,
        bufferedCount: this.bufferedRemoteOps.length,
        opIds: this.bufferedRemoteOps.map((op) => op.opId),
      },
    );

    await this.repository.replaceSyncProjection({
      ...projection,
      runtime: preserveLocalPreferences(projection.runtime, localRuntime),
    });

    this.bufferedRemoteOps = [];
    await this.persistFirstSyncState({
      roomBindingState: 'active',
      firstSyncResolution: resolution,
      pendingLocalSummary: null,
      pendingRemoteSummary: null,
      pendingConflictSummary: null,
    });
    logSyncEvent(
      'info',
      'manager',
      'buffer_drain_complete',
      'Buffered remote ops applied.',
      {
        resolution,
      },
    );
    this.emitStateChanged();
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

  private async republishCreatorSnapshotOnPeerConnect() {
    try {
      const runtime = await this.repository.getRuntimeState();
      await this.publishSnapshotReplace(runtime, 'auto_publish_local');
      logSyncEvent(
        'info',
        'manager',
        'creator_snapshot_republished',
        'Republished creator snapshot after first peer connection.',
        {
          connections: this.health.connections,
          peers: this.health.peers,
        },
      );
    } catch (error) {
      logSyncError(
        'manager',
        'creator_snapshot_republish_failed',
        error,
      );
    }
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

  private logHealthFromBridge(previous: SyncHealth, next: SyncHealth) {
    const signature = buildHealthSignature(next);
    if (signature === this.lastLoggedHealthSignature) {
      return;
    }
    this.lastLoggedHealthSignature = signature;
    logSyncEvent(
      'info',
      'manager',
      'health_update',
      'Sync health updated from bridge.',
      {
        fromStatus: previous.status,
        toStatus: next.status,
        peers: next.peers,
        connections: next.connections,
        bootstrapped: next.bootstrapped,
        syncMode: next.syncMode,
        degradedReason: next.degradedReason,
        degradedSince: next.degradedSince,
        reconnectAttempts: next.reconnectAttempts,
        topicHex: next.topicHex,
        peerKeys: next.peerKeys,
        lastError: next.lastError,
      },
    );
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
    this.resolveTimer = clearTimer(this.resolveTimer);
  }

  private clearEmptyRoomTimer() {
    this.emptyRoomTimer = clearTimer(this.emptyRoomTimer);
  }

  private clearTimers() {
    this.clearResolveTimer();
    this.clearEmptyRoomTimer();
    this.clearPublishTimer();
    this.clearReconnectTimer();
  }

  private clearPublishTimer() {
    this.publishTimer = clearTimer(this.publishTimer);
  }

  private clearPendingPublishes() {
    this.clearPublishTimer();
    this.pendingPublishQueue = [];
  }

  private clearReconnectTimer() {
    this.reconnectTimer = clearTimer(this.reconnectTimer);
  }

  private clearBridgeSubscriptions() {
    this.unsubscribeStatus?.();
    this.unsubscribeViewChanged?.();
    this.unsubscribeStatus = null;
    this.unsubscribeViewChanged = null;
  }
}

export function createSyncManager(
  repository: WorkoutRepository,
  bridge?: SyncBridge,
): SyncManager {
  return new SyncManagerImpl(repository, bridge);
}
