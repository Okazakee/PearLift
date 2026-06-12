import { create } from 'zustand';
import type { AppPromptAction } from '@/components/modals/AppPromptModal';

export interface PromptConfig {
  title: string;
  message: string;
  actions: AppPromptAction[];
}

interface WorkoutUiState {
  promptConfig: PromptConfig | null;
  setPromptConfig: (promptConfig: PromptConfig | null) => void;
}

export const useWorkoutUiStore = create<WorkoutUiState>((set) => ({
  promptConfig: null,
  setPromptConfig: (promptConfig) => set({ promptConfig }),
}));
