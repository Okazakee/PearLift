import { create } from 'zustand';
import type { ChangeSummary, MigratedBackupResult } from '../backup/types';
import type { AppPromptAction } from '../components/modals/AppPromptModal';
import type { WorkoutMutation, WorkoutStoreSnapshot } from '../storage/types';
import type { WorkoutRepository } from '../storage/workoutRepository';
import { WorkoutRepository as WorkoutRepoClass } from '../storage/workoutRepository';

interface PromptConfig {
  title: string;
  message: string;
  actions: AppPromptAction[];
}

interface WorkoutStore {
  repository: WorkoutRepository | null;
  snapshot: WorkoutStoreSnapshot | null;
  isReady: boolean;

  promptConfig: PromptConfig | null;

  exerciseModalOpen: boolean;
  exerciseModalMode: 'add' | 'edit';
  editingExerciseId: string | null;
  programSettingsOpen: boolean;
  settingsOpen: boolean;
  donateModalOpen: boolean;
  localBackupOpen: boolean;
  importPreviewOpen: boolean;
  timerExpanded: boolean;

  pendingImport: MigratedBackupResult | null;
  importSummary: ChangeSummary;

  initialize: () => Promise<void>;
  reload: () => Promise<void>;
  applyMutation: (mutation: WorkoutMutation) => Promise<void>;

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
  setDonateModalOpen: (open: boolean) => void;
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

  promptConfig: null,

  exerciseModalOpen: false,
  exerciseModalMode: 'add',
  editingExerciseId: null,
  programSettingsOpen: false,
  settingsOpen: false,
  donateModalOpen: false,
  localBackupOpen: false,
  importPreviewOpen: false,
  timerExpanded: false,

  pendingImport: null,
  importSummary: { workouts: [], settings: [], totalChanges: 0 },

  initialize: async () => {
    const repo = new WorkoutRepoClass();
    await repo.initialize();
    const snapshot = await repo.getSnapshot();
    set({ repository: repo, snapshot, isReady: true });
  },

  reload: async () => {
    const { repository } = get();
    if (!repository) return;
    const snapshot = await repository.getSnapshot();
    set({ snapshot });
  },

  applyMutation: async (mutation: WorkoutMutation) => {
    const { repository } = get();
    if (!repository) return;

    const skipReload =
      mutation.type !== 'resetAllData' &&
      mutation.type !== 'restoreRuntimeState';

    if (skipReload) {
      const current = get().snapshot;
      if (current) {
        const optimistic = applyOptimisticUpdate(current, mutation);
        set({ snapshot: optimistic });
      }
    }

    try {
      await repository.applyMutation(mutation);
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

  showPrompt: (title, message, actions) => {
    set({
      promptConfig: { title, message, actions: actions ?? [{ label: 'OK' }] },
    });
  },

  closePrompt: () => set({ promptConfig: null }),

  setExerciseModalOpen: (open) => set({ exerciseModalOpen: open }),
  setExerciseModalMode: (mode) => set({ exerciseModalMode: mode }),
  setEditingExerciseId: (id) => set({ editingExerciseId: id }),
  setProgramSettingsOpen: (open) => set({ programSettingsOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setDonateModalOpen: (open) => set({ donateModalOpen: open }),
  setLocalBackupOpen: (open) => set({ localBackupOpen: open }),
  setImportPreviewOpen: (open) => set({ importPreviewOpen: open }),
  setTimerExpanded: (expanded) => set({ timerExpanded: expanded }),
  setPendingImport: (data) => set({ pendingImport: data }),
  setImportSummary: (summary) => set({ importSummary: summary }),
}));

function applyOptimisticUpdate(
  snapshot: WorkoutStoreSnapshot,
  mutation: WorkoutMutation,
): WorkoutStoreSnapshot {
  const newSnapshot = { ...snapshot };

  switch (mutation.type) {
    case 'setThemeMode':
      newSnapshot.themeMode = mutation.themeMode;
      break;
    case 'setCurrentWeek':
      newSnapshot.currentWeek = mutation.currentWeek;
      break;
    case 'setCurrentDay':
      newSnapshot.currentDay = mutation.currentDay;
      break;
    case 'setRestDuration':
      newSnapshot.restDuration = mutation.restDuration;
      break;
    case 'setWeightUnit':
      newSnapshot.weightUnit = mutation.weightUnit;
      break;
    case 'setExerciseWeight':
      newSnapshot.userWeights = {
        ...newSnapshot.userWeights,
        [mutation.exerciseId]: mutation.value,
      };
      break;
    case 'adjustExerciseWeight': {
      const current = newSnapshot.userWeights[mutation.exerciseId] ?? 0;
      newSnapshot.userWeights = {
        ...newSnapshot.userWeights,
        [mutation.exerciseId]: current + mutation.delta,
      };
      break;
    }
    case 'addExercise': {
      const workout = newSnapshot.workouts.find(
        (w) => w.id === mutation.workoutId,
      );
      if (workout) {
        workout.exercises = [...workout.exercises, mutation.exercise as any];
      }
      break;
    }
    case 'editExercise': {
      const workout = newSnapshot.workouts.find(
        (w) => w.id === mutation.workoutId,
      );
      if (workout) {
        workout.exercises = workout.exercises.map((e) =>
          e.id === mutation.exerciseId ? { ...e, ...mutation.updates } : e,
        );
      }
      break;
    }
    case 'deleteExercise': {
      const workout = newSnapshot.workouts.find(
        (w) => w.id === mutation.workoutId,
      );
      if (workout) {
        workout.exercises = workout.exercises.filter(
          (e) => e.id !== mutation.exerciseId,
        );
      }
      break;
    }
    case 'reorderExercises': {
      const workout = newSnapshot.workouts.find(
        (w) => w.id === mutation.workoutId,
      );
      if (workout) {
        const reordered = mutation.orderedExerciseIds
          .map((id) => workout.exercises.find((e) => e.id === id))
          .filter(Boolean) as typeof workout.exercises;
        workout.exercises = reordered;
      }
      break;
    }
    case 'replaceWeekConfigs':
      newSnapshot.weekConfigs = mutation.weekConfigs;
      break;
    case 'replaceDayConfigs':
      newSnapshot.dayConfigs = mutation.dayConfigs;
      break;
    case 'resetAllData':
    case 'restoreRuntimeState':
      break;
  }

  return newSnapshot;
}
