import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  BackupProgramCollection,
  PearLiftRuntimeState,
} from '@/backup/types';
import { getE2EDhtBootstrap } from '@/config/e2e';
import { REST_TIMER_PERSIST_KEY } from '@/config/timer';
import i18n from '@/i18n';
import { cancelRestTimerNotification } from '@/native/localNotifications';
import { RestTimerForegroundService } from '@/native/restTimerForegroundService';
import {
  ensureWorkoutRuntime,
  getWorkoutRuntime,
} from '@/screens/workout/runtime';
import { nowIso } from '@/storage/repository/defaults';
import type {
  SyncFirstSyncResolution,
  SyncRole,
  WorkoutMutation,
  WorkoutStoreSnapshot,
} from '@/storage/types';
import { useSyncStore } from '@/store/syncStore';
import { useWorkoutDataStore } from '@/store/workoutDataStore';
import { type PromptConfig, useWorkoutUiStore } from '@/store/workoutUiStore';
import { canonicalizeMutationForSync } from '@/sync/canonicalize';
import { isSyncableMutation, type SyncManager } from '@/sync/types';
import type { UserExerciseSettings, WorkoutSessionLog } from '@/types';
import type { PersistedRestTimerStateV1 } from '@/types/timer';

type RuntimeSubscriptions = {
  dispose: () => void;
};

let subscriptions: RuntimeSubscriptions | null = null;
let initializingPromise: Promise<void> | null = null;

function getSyncManager(): SyncManager {
  return getWorkoutRuntime().syncManager;
}

function setPromptConfig(promptConfig: PromptConfig | null) {
  useWorkoutUiStore.getState().setPromptConfig(promptConfig);
}

export function showPrompt(
  title: string,
  message: string,
  actions?: PromptConfig['actions'],
) {
  setPromptConfig({
    title,
    message,
    actions: actions ?? [{ label: i18n.t('common.ok') }],
  });
}

export function closePrompt() {
  setPromptConfig(null);
}

async function loadSnapshot(): Promise<WorkoutStoreSnapshot> {
  const { repository } = getWorkoutRuntime();
  const snapshot = await repository.getSnapshot();
  useWorkoutDataStore.getState().setSnapshot(snapshot);
  return snapshot;
}

export async function refreshSyncState() {
  const { repository } = getWorkoutRuntime();
  const [syncState, pairedDevices, localDeviceDisplayName] = await Promise.all([
    repository.getSyncState(),
    repository.getPairedDevices(),
    repository.getLocalDeviceDisplayName(),
  ]);
  const syncStore = useSyncStore.getState();
  syncStore.setSyncStateRow(syncState);
  syncStore.setPairedDevices(pairedDevices);
  syncStore.setLocalDeviceDisplayName(localDeviceDisplayName);
}

export async function refreshSyncLogs() {
  const syncLogs = await getSyncManager().getAllLogs();
  useSyncStore.getState().setSyncLogs(syncLogs);
}

export async function initializeWorkoutRuntime() {
  if (initializingPromise) {
    return initializingPromise;
  }

  initializingPromise = (async () => {
    const { repository, syncManager } = await ensureWorkoutRuntime();

    subscriptions?.dispose();
    const unsubscribeHealth = syncManager.onHealth((health) => {
      useSyncStore.getState().setSyncHealth(health);
    });
    const unsubscribeRemoteApplied = syncManager.onRemoteApplied(() => {
      void loadSnapshot().catch(() => {
        // ignore refresh after remote apply failures
      });
      void refreshSyncState().catch(() => {
        // ignore sync-state refresh failures
      });
    });
    const unsubscribeStateChanged = syncManager.onStateChanged(() => {
      void refreshSyncState().catch(() => {
        // ignore sync-state refresh failures
      });
    });

    subscriptions = {
      dispose: () => {
        unsubscribeHealth();
        unsubscribeRemoteApplied();
        unsubscribeStateChanged();
      },
    };

    const [snapshot, syncState] = await Promise.all([
      repository.getSnapshot(),
      repository.getSyncState(),
    ]);

    useWorkoutDataStore.getState().setSnapshot(snapshot);
    useWorkoutDataStore.getState().setIsReady(true);
    await refreshSyncState();

    if (syncState.syncEnabled) {
      void syncManager
        .start({
          role: syncState.syncRole ?? 'creator',
          bootstrapKeyHex: syncState.autobaseBootstrapKey ?? undefined,
          localSnapshot: snapshot,
        })
        .then(() => refreshSyncState())
        .catch(async () => {
          await refreshSyncState();
        });
    }
  })().finally(() => {
    initializingPromise = null;
  });

  return initializingPromise;
}

function applyOptimisticUpdate(
  snapshot: WorkoutStoreSnapshot,
  mutation: WorkoutMutation,
): WorkoutStoreSnapshot {
  switch (mutation.type) {
    case 'setThemeMode':
      return { ...snapshot, themeMode: mutation.themeMode };
    case 'setCurrentWeek':
      return { ...snapshot, currentWeek: mutation.currentWeek };
    case 'setCurrentDay':
      return {
        ...snapshot,
        currentDay: mutation.currentDay,
        currentDaySelectedAt: nowIso(),
      };
    case 'setRestDuration':
      return { ...snapshot, restDuration: mutation.restDuration };
    case 'setWeightUnit':
      return { ...snapshot, weightUnit: mutation.weightUnit };
    case 'setLanguage':
      return { ...snapshot, language: mutation.language };
    case 'setProgramMetadata':
      return {
        ...snapshot,
        program: snapshot.program
          ? { ...snapshot.program, ...mutation.updates }
          : snapshot.program,
      };
    case 'setExerciseWeight':
      return {
        ...snapshot,
        userWeights: {
          ...snapshot.userWeights,
          [mutation.exerciseId]: mutation.value,
        },
      };
    case 'adjustExerciseWeight': {
      const current = snapshot.userWeights[mutation.exerciseId] ?? 0;
      return {
        ...snapshot,
        userWeights: {
          ...snapshot.userWeights,
          [mutation.exerciseId]: current + mutation.delta,
        },
      };
    }
    default:
      return snapshot;
  }
}

async function clearRestTimerRuntimeState() {
  try {
    const raw = await AsyncStorage.getItem(REST_TIMER_PERSIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedRestTimerStateV1>;
      const id =
        typeof parsed.scheduledNotificationId === 'string'
          ? parsed.scheduledNotificationId
          : null;
      if (id) {
        try {
          await cancelRestTimerNotification(id);
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  try {
    await AsyncStorage.removeItem(REST_TIMER_PERSIST_KEY);
  } catch {
    // ignore
  }

  if (RestTimerForegroundService.isAvailable()) {
    try {
      await RestTimerForegroundService.cancel();
    } catch {
      // ignore
    }
    try {
      await RestTimerForegroundService.clearCompletion();
    } catch {
      // ignore
    }
  }
}

export async function reloadWorkoutSnapshot() {
  await loadSnapshot();
}

export async function saveWorkoutSessionLog(log: WorkoutSessionLog) {
  const { repository } = getWorkoutRuntime();
  await repository.saveWorkoutSessionLog(log);
}

export async function getAvailablePrograms() {
  const { repository } = getWorkoutRuntime();
  return repository.getAvailablePrograms();
}

export async function setActiveProgram(programId: string) {
  const { repository } = getWorkoutRuntime();
  await repository.setActiveProgram(programId);
  await loadSnapshot();
}

export async function importProgram(input: {
  runtime: PearLiftRuntimeState;
  sessionLogs: WorkoutSessionLog[];
  mode: 'import_as_new' | 'replace_active';
  activate?: boolean;
}) {
  const { repository } = getWorkoutRuntime();
  await repository.importProgram(input);
  await loadSnapshot();
}

export async function getBackupProgramCollection(): Promise<BackupProgramCollection> {
  const { repository } = getWorkoutRuntime();
  return repository.getBackupProgramCollection();
}

export async function getRecentWorkoutSessionLogs(limit = 120) {
  const { repository } = getWorkoutRuntime();
  return repository.getWorkoutSessionLogs({ limit });
}

export async function getAllWorkoutSessionLogs() {
  const { repository } = getWorkoutRuntime();
  return repository.getWorkoutSessionLogs({ limit: null });
}

export async function saveUserExerciseSettings(settings: UserExerciseSettings) {
  const { repository } = getWorkoutRuntime();
  await repository.saveUserExerciseSettings(settings);
  await loadSnapshot();
}

export async function applyWorkoutMutation(mutation: WorkoutMutation) {
  const { repository, syncManager } = getWorkoutRuntime();
  const dataStore = useWorkoutDataStore.getState();
  const syncStore = useSyncStore.getState();
  const skipReload =
    mutation.type === 'setThemeMode' ||
    mutation.type === 'setCurrentWeek' ||
    mutation.type === 'setCurrentDay' ||
    mutation.type === 'setRestDuration' ||
    mutation.type === 'setWeightUnit' ||
    mutation.type === 'setLanguage' ||
    mutation.type === 'setProgramMetadata' ||
    mutation.type === 'setExerciseWeight' ||
    mutation.type === 'adjustExerciseWeight';

  if (skipReload && dataStore.snapshot) {
    dataStore.setSnapshot(applyOptimisticUpdate(dataStore.snapshot, mutation));
  }

  try {
    if (mutation.type === 'resetAllData') {
      await syncManager.leaveRoom();
    }

    await repository.applyMutation(mutation);

    let persistedSnapshot: WorkoutStoreSnapshot | null = null;
    const shouldPublish =
      syncManager.isActive() && isSyncableMutation(mutation);
    const syncEnabled =
      isSyncableMutation(mutation) && syncStore.syncState?.syncEnabled === true;

    if (!skipReload || shouldPublish || syncEnabled) {
      persistedSnapshot = await repository.getSnapshot();
      dataStore.setSnapshot(persistedSnapshot);
    }

    if (mutation.type === 'resetAllData') {
      await clearRestTimerRuntimeState();
      await refreshSyncState();
    }

    if (shouldPublish) {
      await syncManager.publishLocalMutation(
        mutation,
        persistedSnapshot ?? dataStore.snapshot,
      );
    } else if (syncEnabled) {
      const canonical = canonicalizeMutationForSync(
        mutation,
        persistedSnapshot ?? dataStore.snapshot,
      );
      if (canonical) {
        await repository.queuePendingLocalSyncMutation(canonical);
      }
    }
  } catch (error) {
    const snapshot = await repository.getSnapshot();
    dataStore.setSnapshot(snapshot);
    throw error;
  }
}

export async function startSync(
  role: SyncRole,
  pairingSecretHex?: string,
  bootstrapKeyHex?: string | null,
) {
  const snapshot = useWorkoutDataStore.getState().snapshot;
  const syncManager = getSyncManager();
  await syncManager.start({
    role,
    pairingSecretHex,
    bootstrapKeyHex: bootstrapKeyHex ?? undefined,
    dhtBootstrap: getE2EDhtBootstrap(),
    localSnapshot: snapshot,
  });
  await refreshSyncState();
  await refreshSyncLogs();
}

export async function stopSync() {
  const syncManager = getSyncManager();
  await syncManager.stop();
  await refreshSyncState();
  await refreshSyncLogs();
}

export async function forgetPairedDevice(deviceId: string) {
  const { repository } = getWorkoutRuntime();
  await repository.forgetDevice(deviceId);
  await refreshSyncState();
}

export async function renameLocalDevice(displayName: string) {
  const { repository } = getWorkoutRuntime();
  const syncManager = getSyncManager();
  const normalized = displayName.trim();
  if (!normalized) {
    throw new Error('Device name cannot be empty.');
  }
  await repository.setLocalDeviceDisplayName(normalized);
  if (syncManager.isActive()) {
    try {
      await syncManager.publishDeviceProfile(normalized);
      await repository.clearPendingDeviceProfileDisplayName();
    } catch {
      await repository.setPendingDeviceProfileDisplayName(normalized);
      showPrompt(
        i18n.t('sync.manage.saveDeviceName'),
        i18n.t('sync.manage.deviceNameSyncPending'),
      );
    }
  }
  await refreshSyncState();
}

export async function leaveSyncRoom() {
  const { repository } = getWorkoutRuntime();
  const syncManager = getSyncManager();
  if (syncManager) {
    await syncManager.leaveRoom();
  } else {
    await repository.leaveSyncRoom();
  }
  await refreshSyncState();
  await refreshSyncLogs();
}

export async function resolveFirstSyncChoice(
  choice: Extract<
    SyncFirstSyncResolution,
    'local_chosen' | 'remote_chosen' | 'merge_chosen'
  >,
) {
  const normalizedChoice =
    choice === 'local_chosen'
      ? 'local'
      : choice === 'remote_chosen'
        ? 'remote'
        : 'merge';
  await getSyncManager().resolveFirstSyncChoice(normalizedChoice);
  await reloadWorkoutSnapshot();
  await refreshSyncState();
  await refreshSyncLogs();
}

export async function finishOnboarding() {
  const { repository } = getWorkoutRuntime();
  await repository.markSetupDone();
  await reloadWorkoutSnapshot();
}
