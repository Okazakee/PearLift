import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { create } from 'zustand';
import type { ChangeSummary, MigratedBackupResult } from '../backup/types';
import type { AppPromptAction } from '../components/modals/AppPromptModal';
import { REST_TIMER_PERSIST_KEY } from '../config/timer';
import i18n from '../i18n';
import { RestTimerForegroundService } from '../native/restTimerForegroundService';
import type {
  PairedDevice,
  WorkoutMutation,
  WorkoutStoreSnapshot,
} from '../storage/types';
import type { WorkoutRepository } from '../storage/workoutRepository';
import { WorkoutRepository as WorkoutRepoClass } from '../storage/workoutRepository';
import { createSyncManager } from '../sync/syncManager';
import type { SyncHealth, SyncManager, SyncStatus } from '../sync/types';
import type { PersistedRestTimerStateV1 } from '../types/timer';

interface PromptConfig {
  title: string;
  message: string;
  actions: AppPromptAction[];
}

interface WorkoutStore {
  repository: WorkoutRepository | null;
  syncManager: SyncManager | null;
  snapshot: WorkoutStoreSnapshot | null;
  isReady: boolean;

  syncStatus: SyncStatus;
  syncPeers: number;
  lastSyncedAt: string | null;
  syncError: string | null;
  pairedDevices: PairedDevice[];
  syncSecret: string | null;
  syncSetupOpen: boolean;

  promptConfig: PromptConfig | null;

  exerciseModalOpen: boolean;
  exerciseModalMode: 'add' | 'edit';
  editingExerciseId: string | null;
  programSettingsOpen: boolean;
  settingsOpen: boolean;
  languageListOpen: boolean;
  localBackupOpen: boolean;
  importPreviewOpen: boolean;
  timerExpanded: boolean;

  pendingImport: MigratedBackupResult | null;
  importSummary: ChangeSummary;

  initialize: () => Promise<void>;
  reload: () => Promise<void>;
  applyMutation: (mutation: WorkoutMutation) => Promise<void>;
  startSync: (pairingSecretHex?: string) => Promise<void>;
  stopSync: () => Promise<void>;
  setSyncHealth: (health: SyncHealth) => void;
  loadPairedDevices: () => Promise<void>;
  forgetDevice: (deviceId: string) => Promise<void>;
  setSyncSecret: (secret: string | null) => void;
  setSyncSetupOpen: (open: boolean) => void;

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
  setLanguageListOpen: (open: boolean) => void;
  setLocalBackupOpen: (open: boolean) => void;
  setImportPreviewOpen: (open: boolean) => void;
  setTimerExpanded: (expanded: boolean) => void;
  setPendingImport: (data: MigratedBackupResult | null) => void;
  setImportSummary: (summary: ChangeSummary) => void;
}

export const useWorkoutStore = create<WorkoutStore>((set, get) => ({
  repository: null,
  syncManager: null,
  snapshot: null,
  isReady: false,

  syncStatus: 'idle',
  syncPeers: 0,
  lastSyncedAt: null,
  syncError: null,
  pairedDevices: [],
  syncSecret: null,
  syncSetupOpen: false,

  promptConfig: null,

  exerciseModalOpen: false,
  exerciseModalMode: 'add',
  editingExerciseId: null,
  programSettingsOpen: false,
  settingsOpen: false,
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
    const repo = new WorkoutRepoClass();
    await repo.initialize();
    const snapshot = await repo.getSnapshot();
    const syncManager = createSyncManager(repo);
    const syncState = await repo.getSyncState();

    syncManager.onHealth((health) => {
      const current = get().syncManager;
      if (current !== syncManager) {
        return;
      }
      set({
        syncStatus: health.status,
        syncPeers: health.peers,
        lastSyncedAt: health.lastSyncedAt,
        syncError: health.lastError,
      });
      if (health.status === 'synced') {
        void get().loadPairedDevices();
      }
    });

    set({
      repository: repo,
      syncManager,
      snapshot,
      isReady: true,
      lastSyncedAt: syncState.lastSyncedAt,
      syncError: syncState.lastError,
    });

    if (syncState.syncEnabled) {
      try {
        await syncManager.start();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Sync start failed';
        set({ syncStatus: 'error', syncError: message });
      }
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
      await repository.applyMutation(mutation);

      if (syncManager?.isActive()) {
        try {
          await syncManager.publishLocalMutation(mutation, get().snapshot);
        } catch (syncError) {
          const message =
            syncError instanceof Error
              ? syncError.message
              : 'Failed to publish sync operation';
          set({ syncStatus: 'error', syncError: message });
        }
      }

      if (mutation.type === 'resetAllData') {
        await clearRestTimerRuntimeState();
      }
      if (!skipReload) {
        const snapshot = await repository.getSnapshot();
        set({ snapshot });
      }
    } catch (error) {
      const snapshot = await repository.getSnapshot();
      set({ snapshot });
      throw error;
    }
  },

  startSync: async (pairingSecretHex?: string) => {
    const { syncManager } = get();
    if (!syncManager) {
      return;
    }
    set({ syncStatus: 'connecting', syncError: null });
    try {
      await syncManager.start(pairingSecretHex);
      void get().loadPairedDevices();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Sync start failed';
      set({ syncStatus: 'error', syncError: message });
      throw error;
    }
  },

  stopSync: async () => {
    const { syncManager } = get();
    if (!syncManager) {
      return;
    }
    await syncManager.stop();
    set({ syncStatus: 'idle', syncPeers: 0, syncError: null });
  },

  setSyncHealth: (health) => {
    set({
      syncStatus: health.status,
      syncPeers: health.peers,
      lastSyncedAt: health.lastSyncedAt,
      syncError: health.lastError,
    });
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
  setLanguageListOpen: (open) => set({ languageListOpen: open }),
  setLocalBackupOpen: (open) => set({ localBackupOpen: open }),
  setImportPreviewOpen: (open) => set({ importPreviewOpen: open }),
  setTimerExpanded: (expanded) => set({ timerExpanded: expanded }),
  setPendingImport: (data) => set({ pendingImport: data }),
  setImportSummary: (summary) => set({ importSummary: summary }),

  loadPairedDevices: async () => {
    const { repository } = get();
    if (!repository) return;
    const devices = await repository.getPairedDevices();
    set({ pairedDevices: devices });
  },

  forgetDevice: async (deviceId: string) => {
    const { repository } = get();
    if (!repository) return;
    await repository.forgetDevice(deviceId);
    const devices = await repository.getPairedDevices();
    set({ pairedDevices: devices });
  },

  setSyncSecret: (secret) => set({ syncSecret: secret }),
  setSyncSetupOpen: (open) => set({ syncSetupOpen: open }),
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
          await Notifications.cancelScheduledNotificationAsync(id);
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
