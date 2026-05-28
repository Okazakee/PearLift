import { create } from 'zustand';
import type { AppPromptAction } from '@/components/modals/AppPromptModal';

export interface PromptConfig {
  title: string;
  message: string;
  actions: AppPromptAction[];
}

interface WorkoutUiState {
  promptConfig: PromptConfig | null;
  exerciseModalOpen: boolean;
  exerciseModalMode: 'add' | 'edit';
  editingExerciseId: string | null;
  programSettingsOpen: boolean;
  settingsOpen: boolean;
  syncDebugOpen: boolean;
  languageListOpen: boolean;
  importPreviewOpen: boolean;
  timerExpanded: boolean;
  setPromptConfig: (promptConfig: PromptConfig | null) => void;
  setExerciseModalOpen: (open: boolean) => void;
  setExerciseModalMode: (mode: 'add' | 'edit') => void;
  setEditingExerciseId: (id: string | null) => void;
  setProgramSettingsOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setSyncDebugOpen: (open: boolean) => void;
  setLanguageListOpen: (open: boolean) => void;
  setImportPreviewOpen: (open: boolean) => void;
  setTimerExpanded: (expanded: boolean) => void;
}

export const useWorkoutUiStore = create<WorkoutUiState>((set) => ({
  promptConfig: null,
  exerciseModalOpen: false,
  exerciseModalMode: 'add',
  editingExerciseId: null,
  programSettingsOpen: false,
  settingsOpen: false,
  syncDebugOpen: false,
  languageListOpen: false,
  importPreviewOpen: false,
  timerExpanded: false,
  setPromptConfig: (promptConfig) => set({ promptConfig }),
  setExerciseModalOpen: (exerciseModalOpen) => set({ exerciseModalOpen }),
  setExerciseModalMode: (exerciseModalMode) => set({ exerciseModalMode }),
  setEditingExerciseId: (editingExerciseId) => set({ editingExerciseId }),
  setProgramSettingsOpen: (programSettingsOpen) => set({ programSettingsOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setSyncDebugOpen: (syncDebugOpen) => set({ syncDebugOpen }),
  setLanguageListOpen: (languageListOpen) => set({ languageListOpen }),
  setImportPreviewOpen: (importPreviewOpen) => set({ importPreviewOpen }),
  setTimerExpanded: (timerExpanded) => set({ timerExpanded }),
}));
