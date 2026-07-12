import { create } from 'zustand';
import type { AppPromptAction } from '@/components/modals/AppPromptModal';
import type { ProgressionSuggestion } from '@/types';

export interface PromptConfig {
  title: string;
  message: string;
  actions: AppPromptAction[];
}

interface WorkoutUiState {
  promptConfig: PromptConfig | null;
  progressionSuggestions: ProgressionSuggestion[];
  setPromptConfig: (promptConfig: PromptConfig | null) => void;
  appendProgressionSuggestions: (suggestions: ProgressionSuggestion[]) => void;
  removeProgressionSuggestion: (suggestionId: string) => void;
}

export const useWorkoutUiStore = create<WorkoutUiState>((set) => ({
  promptConfig: null,
  progressionSuggestions: [],
  setPromptConfig: (promptConfig) => set({ promptConfig }),
  appendProgressionSuggestions: (suggestions) =>
    set((state) => {
      if (suggestions.length === 0) {
        return state;
      }

      const next = [...state.progressionSuggestions];
      for (const suggestion of suggestions) {
        if (next.some((item) => item.id === suggestion.id)) {
          continue;
        }
        next.push(suggestion);
      }

      return {
        progressionSuggestions: next,
      };
    }),
  removeProgressionSuggestion: (suggestionId) =>
    set((state) => ({
      progressionSuggestions: state.progressionSuggestions.filter(
        (item) => item.id !== suggestionId,
      ),
    })),
}));
