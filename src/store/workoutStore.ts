import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { ChangeSummary, MigratedBackupResult } from '@/backup/types';
import type { AppPromptAction } from '@/components/modals/AppPromptModal';
import { REST_TIMER_PERSIST_KEY } from '@/config/timer';
import i18n from '@/i18n';
import { cancelRestTimerNotification } from '@/native/localNotifications';
import { RestTimerForegroundService } from '@/native/restTimerForegroundService';
import type {
  PairedDevice,
  SyncFirstSyncResolution,
  SyncRole,
  SyncStateRow,
  WorkoutMutation,
  WorkoutStoreSnapshot,
} from '@/storage/types';
import type { WorkoutRepository } from '@/storage/workoutRepository';
import { WorkoutRepository as WorkoutRepoClass } from '@/storage/workoutRepository';
import { canonicalizeMutationForSync } from '@/sync/canonicalize';
import type { SyncLogEntry } from '@/sync/logger';
import { createSyncManager } from '@/sync/syncManager';
import {
  INITIAL_SYNC_HEALTH,
  isSyncableMutation,
  type SyncHealth,
  type SyncManager,
} from '@/sync/types';
import type { PersistedRestTimerStateV1 } from '@/types/timer';

interface PromptConfig {
  title: string;
  message: string;
  actions: AppPromptAction[];
}

interface WorkoutStore {
  repository: WorkoutRepository | null;
  snapshot: WorkoutStoreSnapshot | null;
  isReady: boolean;
  syncManager: SyncManager | null;
  syncState: SyncStateRow | null;
  syncHealth: SyncHealth;
  pairedDevices: PairedDevice[];
  localDeviceDisplayName: string;
  syncLogs: SyncLogEntry[];

  promptConfig: PromptConfig | null;

  exerciseModalOpen: boolean;
  exerciseModalMode: 'add' | 'edit';
  editingExerciseId: string | null;
  programSettingsOpen: boolean;
  settingsOpen: boolean;
  syncManagementOpen: boolean;
  syncDebugOpen: boolean;
  languageListOpen: boolean;
  localBackupOpen: boolean;
  importPreviewOpen: boolean;
  timerExpanded: boolean;

  pendingImport: MigratedBackupResult | null;
  importSummary: ChangeSummary;

  initialize: () => Promise<void>;
  reload: () => Promise<void>;
  applyMutation: (mutation: WorkoutMutation) => Promise<void>;
  refreshSyncState: () => Promise<void>;
  refreshSyncLogs: () => Promise<void>;
  startSync: (
    role: SyncRole,
    pairingSecretHex?: string,
    bootstrapKeyHex?: string | null,
  ) => Promise<void>;
  stopSync: () => Promise<void>;
  forgetPairedDevice: (deviceId: string) => Promise<void>;
  renameLocalDevice: (displayName: string) => Promise<void>;
  leaveSyncRoom: () => Promise<void>;
  resolveFirstSyncChoice: (
    choice: Extract<
      SyncFirstSyncResolution,
      'local_chosen' | 'remote_chosen' | 'merge_chosen'
    >,
  ) => Promise<void>;

  showPrompt: (
    title: string,
    message: string,
    actions?: AppPromptAction[],
  ) => void;
  closePrompt: () => void;

  setExerciseModalOpen: (open: boolean) => void;
  setExerciseModalMode: (mode: 'add' | 'edit') => void;
  setEditingExerciseId: (id: string | null) => void;
  setProgramSettingsOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setSyncManagementOpen: (open: boolean) => void;
  setSyncDebugOpen: (open: boolean) => void;
  setLanguageListOpen: (open: boolean) => void;
  setLocalBackupOpen: (open: boolean) => void;
  setImportPreviewOpen: (open: boolean) => void;
  setTimerExpanded: (expanded: boolean) => void;
  setPendingImport: (data: MigratedBackupResult | null) => void;
  setImportSummary: (summary: ChangeSummary) => void;
}

export const useWorkoutStore = create<WorkoutStore>((set, get) => ({
  repository: null,
  snapshot: null,
  isReady: false,
  syncManager: null,
  syncState: null,
  syncHealth: { ...INITIAL_SYNC_HEALTH },
  pairedDevices: [],
  localDeviceDisplayName: '',
  syncLogs: [],

  promptConfig: null,

  exerciseModalOpen: false,
  exerciseModalMode: 'add',
  editingExerciseId: null,
  programSettingsOpen: false,
  settingsOpen: false,
  syncManagementOpen: false,
  syncDebugOpen: false,
  languageListOpen: false,
  localBackupOpen: false,
  importPreviewOpen: false,
  timerExpanded: false,

  pendingImport: null,
  importSummary: {
    workouts: [],
    settings: [],
    weekConfigs: [],
    dayConfigs: [],
    totalChanges: 0,
  },

  initialize: async () => {
    if (get().repository) return;

    const repo = new WorkoutRepoClass();
    await repo.initialize();
    const [snapshot, syncState, pairedDevices, localDeviceDisplayName] =
      await Promise.all([
        repo.getSnapshot(),
        repo.getSyncState(),
        repo.getPairedDevices(),
        repo.getLocalDeviceDisplayName(),
      ]);
    const syncManager = createSyncManager(repo);

    syncManager.onHealth((health) => {
      set({ syncHealth: health });
    });

    syncManager.onRemoteApplied(() => {
      void get().reload();
      void get().refreshSyncState();
    });
    syncManager.onStateChanged(() => {
      void get().refreshSyncState();
    });

    set({
      repository: repo,
      snapshot,
      isReady: true,
      syncManager,
      syncState,
      syncHealth: syncManager.getHealth(),
      pairedDevices,
      localDeviceDisplayName,
    });

    if (syncState.syncEnabled) {
      void syncManager
        .start({
          role: syncState.syncRole ?? 'creator',
          bootstrapKeyHex: syncState.autobaseBootstrapKey ?? undefined,
          localSnapshot: snapshot,
        })
        .then(() => get().refreshSyncState())
        .catch(async () => {
          await get().refreshSyncState();
        });
    }
  },

  reload: async () => {
    const { repository } = get();
    if (!repository) return;
    const snapshot = await repository.getSnapshot();
    set({ snapshot });
  },

  applyMutation: async (mutation: WorkoutMutation) => {
    const { repository, syncManager } = get();
    if (!repository) return;

    const skipReload =
      mutation.type === 'setThemeMode' ||
      mutation.type === 'setCurrentWeek' ||
      mutation.type === 'setCurrentDay' ||
      mutation.type === 'setRestDuration' ||
      mutation.type === 'setWeightUnit' ||
      mutation.type === 'setExerciseWeight' ||
      mutation.type === 'adjustExerciseWeight';

    if (skipReload) {
      const current = get().snapshot;
      if (current) {
        const optimistic = applyOptimisticUpdate(current, mutation);
        set({ snapshot: optimistic });
      }
    }

    try {
      if (mutation.type === 'resetAllData') {
        const { syncManager: manager } = get();
        if (manager) {
          await manager.leaveRoom();
        }
      }

      await repository.applyMutation(mutation);

      let persistedSnapshot: WorkoutStoreSnapshot | null = null;
      const shouldPublish =
        !!syncManager?.isActive() && isSyncableMutation(mutation);

      if (!skipReload || shouldPublish) {
        persistedSnapshot = await repository.getSnapshot();
        set({ snapshot: persistedSnapshot });
      }

      if (mutation.type === 'resetAllData') {
        await clearRestTimerRuntimeState();
        await get().refreshSyncState();
      }

      if (shouldPublish && syncManager) {
        await syncManager.publishLocalMutation(
          mutation,
          persistedSnapshot ?? get().snapshot,
        );
      } else if (isSyncableMutation(mutation)) {
        const canonical = canonicalizeMutationForSync(
          mutation,
          persistedSnapshot ?? get().snapshot,
        );
        if (canonical) {
          await repository.queuePendingLocalSyncMutation(canonical);
        }
      }
    } catch (error) {
      const snapshot = await repository.getSnapshot();
      set({ snapshot });
      throw error;
    }
  },

  refreshSyncState: async () => {
    const { repository } = get();
    if (!repository) return;
    const [syncState, pairedDevices, localDeviceDisplayName] =
      await Promise.all([
        repository.getSyncState(),
        repository.getPairedDevices(),
        repository.getLocalDeviceDisplayName(),
      ]);
    set({ syncState, pairedDevices, localDeviceDisplayName });
  },

  refreshSyncLogs: async () => {
    const { syncManager } = get();
    if (!syncManager) {
      set({ syncLogs: [] });
      return;
    }
    const syncLogs = await syncManager.getAllLogs();
    set({ syncLogs });
  },

  startSync: async (role, pairingSecretHex, bootstrapKeyHex) => {
    const { syncManager, snapshot } = get();
    if (!syncManager) return;
    await syncManager.start({
      role,
      pairingSecretHex,
      bootstrapKeyHex: bootstrapKeyHex ?? undefined,
      localSnapshot: snapshot,
    });
    await get().refreshSyncState();
    await get().refreshSyncLogs();
  },

  stopSync: async () => {
    const { syncManager } = get();
    if (!syncManager) return;
    await syncManager.stop();
    await get().refreshSyncState();
    await get().refreshSyncLogs();
  },

  forgetPairedDevice: async (deviceId) => {
    const { repository } = get();
    if (!repository) return;
    await repository.forgetDevice(deviceId);
    await get().refreshSyncState();
  },

  renameLocalDevice: async (displayName) => {
    const { repository, syncManager } = get();
    if (!repository) return;
    const normalized = displayName.trim();
    if (!normalized) {
      throw new Error('Device name cannot be empty.');
    }
    await repository.setLocalDeviceDisplayName(normalized);
    if (syncManager?.isActive()) {
      try {
        await syncManager.publishDeviceProfile(normalized);
        await repository.clearPendingDeviceProfileDisplayName();
      } catch {
        await repository.setPendingDeviceProfileDisplayName(normalized);
        set({
          promptConfig: {
            title: i18n.t('sync.manage.saveDeviceName'),
            message: i18n.t('sync.manage.deviceNameSyncPending'),
            actions: [{ label: i18n.t('common.ok') }],
          },
        });
      }
    }
    await get().refreshSyncState();
  },

  leaveSyncRoom: async () => {
    const { syncManager, repository } = get();
    if (!repository) return;
    if (syncManager) {
      await syncManager.leaveRoom();
    } else {
      await repository.leaveSyncRoom();
    }
    await get().refreshSyncState();
    await get().refreshSyncLogs();
  },

  resolveFirstSyncChoice: async (choice) => {
    const { syncManager } = get();
    if (!syncManager) return;
    const normalizedChoice =
      choice === 'local_chosen'
        ? 'local'
        : choice === 'remote_chosen'
          ? 'remote'
          : 'merge';
    await syncManager.resolveFirstSyncChoice(normalizedChoice);
    await get().reload();
    await get().refreshSyncState();
    await get().refreshSyncLogs();
  },

  showPrompt: (title, message, actions) => {
    set({
      promptConfig: {
        title,
        message,
        actions: actions ?? [{ label: i18n.t('common.ok') }],
      },
    });
  },

  closePrompt: () => set({ promptConfig: null }),

  setExerciseModalOpen: (open) => set({ exerciseModalOpen: open }),
  setExerciseModalMode: (mode) => set({ exerciseModalMode: mode }),
  setEditingExerciseId: (id) => set({ editingExerciseId: id }),
  setProgramSettingsOpen: (open) => set({ programSettingsOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSyncManagementOpen: (open) => set({ syncManagementOpen: open }),
  setSyncDebugOpen: (open) => set({ syncDebugOpen: open }),
  setLanguageListOpen: (open) => set({ languageListOpen: open }),
  setLocalBackupOpen: (open) => set({ localBackupOpen: open }),
  setImportPreviewOpen: (open) => set({ importPreviewOpen: open }),
  setTimerExpanded: (expanded) => set({ timerExpanded: expanded }),
  setPendingImport: (data) => set({ pendingImport: data }),
  setImportSummary: (summary) => set({ importSummary: summary }),
}));

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
      return { ...snapshot, currentDay: mutation.currentDay };
    case 'setRestDuration':
      return { ...snapshot, restDuration: mutation.restDuration };
    case 'setWeightUnit':
      return { ...snapshot, weightUnit: mutation.weightUnit };
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
