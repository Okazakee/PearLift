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
import { INITIAL_SYNC_HEALTH } from '../sync/types';
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
  syncPeerKeys: string[];
  syncLocalPublicKey: string | null;
  syncAutobaseKey: string | null;
  syncTopicHex: string | null;
  syncBootstrapped: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  pairedDevices: PairedDevice[];
  syncSecret: string | null;
  syncSetupOpen: boolean;
  newPeerSignal: string | null;

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

  seenPeerKeys: Set<string>;

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
  acknowledgeNewPeerSignal: () => void;

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

  syncStatus: INITIAL_SYNC_HEALTH.status,
  syncPeers: INITIAL_SYNC_HEALTH.peers,
  syncPeerKeys: INITIAL_SYNC_HEALTH.peerKeys,
  syncLocalPublicKey: INITIAL_SYNC_HEALTH.localPublicKey,
  syncAutobaseKey: INITIAL_SYNC_HEALTH.autobaseKey,
  syncTopicHex: INITIAL_SYNC_HEALTH.topicHex,
  syncBootstrapped: INITIAL_SYNC_HEALTH.bootstrapped,
  lastSyncedAt: INITIAL_SYNC_HEALTH.lastSyncedAt,
  syncError: INITIAL_SYNC_HEALTH.lastError,
  pairedDevices: [],
  syncSecret: null,
  syncSetupOpen: false,
  newPeerSignal: null,
  seenPeerKeys: new Set<string>(),

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
      const prev = get();
      const prevKeys = new Set(prev.syncPeerKeys);
      const nextKeys = health.peerKeys;
      let newPeer: string | null = prev.newPeerSignal;
      for (const key of nextKeys) {
        if (!prev.seenPeerKeys.has(key)) {
          newPeer = key;
        }
      }
      const mergedSeen = new Set(prev.seenPeerKeys);
      for (const key of nextKeys) mergedSeen.add(key);

      set({
        syncStatus: health.status,
        syncPeers: health.peers,
        syncPeerKeys: nextKeys,
        syncLocalPublicKey: health.localPublicKey,
        syncAutobaseKey: health.autobaseKey,
        syncTopicHex: health.topicHex,
        syncBootstrapped: health.bootstrapped,
        lastSyncedAt: health.lastSyncedAt,
        syncError: health.lastError,
        seenPeerKeys: mergedSeen,
        newPeerSignal: newPeer,
      });

      const peerSetChanged =
        prevKeys.size !== nextKeys.length ||
        nextKeys.some((k) => !prevKeys.has(k));
      if (peerSetChanged || health.status === 'synced') {
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
    set({
      syncStatus: 'idle',
      syncPeers: 0,
      syncPeerKeys: [],
      syncLocalPublicKey: null,
      syncAutobaseKey: null,
      syncTopicHex: null,
      syncBootstrapped: false,
      syncError: null,
      pairedDevices: [],
      seenPeerKeys: new Set<string>(),
      newPeerSignal: null,
    });
  },

  setSyncHealth: (health) => {
    set({
      syncStatus: health.status,
      syncPeers: health.peers,
      syncPeerKeys: health.peerKeys,
      syncLocalPublicKey: health.localPublicKey,
      syncAutobaseKey: health.autobaseKey,
      syncTopicHex: health.topicHex,
      syncBootstrapped: health.bootstrapped,
      lastSyncedAt: health.lastSyncedAt,
      syncError: health.lastError,
    });
  },

  acknowledgeNewPeerSignal: () => set({ newPeerSignal: null }),

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
