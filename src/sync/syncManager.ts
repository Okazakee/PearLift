import type { PearLiftRuntimeState } from '@/backup/types';
import type { SyncFirstSyncResolution, SyncRole } from '@/storage/types';
import type {
  WorkoutMutation,
  WorkoutRepository,
  WorkoutStoreSnapshot,
} from '@/storage';
import { logError } from '@/utils/errors';
import { createSyncBridge } from '@/sync/bridge';
import { buildHealthSignature } from '@/sync/manager/health';
import { getLatestSnapshotPayload } from '@/sync/manager/joinResolution';
import { classifyStartError } from '@/sync/manager/lifecycle';
import {
  shouldBufferDuringActiveConflict,
  shouldBufferDuringJoin,
  shouldTryReconnectConflict,
} from '@/sync/manager/remoteApply';
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
  cloneRuntime,
  getOpPayload,
  mutationsConflict,
  applyOpsToRuntimePreview,
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
  SyncSnapshotReplacePayload,
} from '@/sync/types';
import { INITIAL_SYNC_HEALTH } from '@/sync/types';

export { getPairingSecretPayload, setPairingSecretPayload, clearPairingSecret };

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
  private pendingDeviceProfileFlushInFlight = false;
  private bridgeStartResolved = false;
  private health: SyncHealth = { ...INITIAL_SYNC_HEALTH };
  private lastLoggedHealthSignature: string | null = null;

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
        const shouldReplayRemoteHistory =
          input.role === 'joiner' &&
          (syncState.roomBindingState === 'pending_first_sync' ||
            syncState.roomBindingState === 'conflict_requires_decision');

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
        this.unsubscribeRemoteOp = this.bridge.onRemoteOp((op) => {
          void this.handleRemoteOp(op);
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
          debug: shouldReplayRemoteHistory
            ? { disableCursorOptimization: true }
            : undefined,
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
        await this.repository.pruneAppliedSyncOps();
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
      shouldBufferDuringJoin(op, this.currentRole, syncState.roomBindingState)
    ) {
      this.bufferedRemoteOps.push(op);
      logSyncEvent(
        'info',
        'manager',
        'remote_buffered',
        'Buffered remote op pending first-sync resolution.',
        {
          opId: op.opId,
          kind: payload.kind,
          bufferedCount: this.bufferedRemoteOps.length,
          ...summarizeRoomBindingState(syncState),
        },
      );
      this.schedulePendingJoinResolution();
      this.checkBufferOverflow();
      return;
    }

    if (shouldBufferDuringActiveConflict(op, syncState.roomBindingState)) {
      this.bufferedRemoteOps.push(op);
      logSyncEvent(
        'info',
        'manager',
        'remote_buffered_active_conflict',
        'Buffered remote op pending active-room conflict resolution.',
        {
          opId: op.opId,
          kind: payload.kind,
          bufferedCount: this.bufferedRemoteOps.length,
          ...summarizeRoomBindingState(syncState),
        },
      );
      this.checkBufferOverflow();
      return;
    }

    if (
      shouldTryReconnectConflict(
        op,
        syncState.roomBindingState,
        this.pendingReconnectLocalMutations,
      )
    ) {
      const conflict = await this.tryEnterActiveConflict(op, payload);
      if (conflict) {
        return;
      }
    }

    await this.applyRemoteOp(op);
  }

  private checkBufferOverflow() {
    if (this.bufferedRemoteOps.length <= MAX_BUFFERED_REMOTE_OPS) return;

    logSyncEvent(
      'warn',
      'manager',
      'buffer_overflow',
      'Buffered remote ops exceeded limit. Forcing decision modal.',
      {
        bufferedCount: this.bufferedRemoteOps.length,
        limit: MAX_BUFFERED_REMOTE_OPS,
      },
    );
    this.clearResolveTimer();
    void this.resolvePendingJoin(false);
  }

  async resolveFirstSyncChoice(choice: 'local' | 'remote' | 'merge') {
    const localRuntime =
      this.pendingLocalRuntime ?? (await this.repository.getRuntimeState());

    if (choice === 'merge') {
      const { remoteSnapshotPayload } = getLatestSnapshotPayload(
        this.bufferedRemoteOps,
      );
      const remoteRuntime = remoteSnapshotPayload!.runtime;
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
    const { latestSnapshotOp, remoteSnapshotPayload } = getLatestSnapshotPayload(
      this.bufferedRemoteOps,
    );

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
        latestSnapshotOpId: latestSnapshotOp?.opId ?? null,
        remoteOpKinds: this.bufferedRemoteOps.map((op) => getOpPayload(op).kind),
        ...summarizeRoomBindingState(syncState),
      },
    );

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

    const remoteOpCount = this.bufferedRemoteOps.filter(
      (op) => getOpPayload(op).kind !== 'presence',
    ).length;

    const resolution = resolveFirstSync(
      localRuntime,
      remoteSnapshotPayload.runtime,
      remoteOpCount,
    );

    logSyncEvent(
      'info',
      'manager',
      'join_resolution_decided',
      'Resolved pending join strategy.',
      {
        resolution: resolution.kind,
        remoteOpCount,
        bufferedCount: this.bufferedRemoteOps.length,
        snapshotOpId: latestSnapshotOp?.opId ?? null,
      },
    );

    switch (resolution.kind) {
      case 'already_in_sync':
        if (remoteOpCount > 0) {
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
              remoteOpCount,
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
