import { create } from 'zustand';
import type { WorkoutStoreSnapshot } from '@/storage/types';

interface WorkoutDataState {
  snapshot: WorkoutStoreSnapshot | null;
  isReady: boolean;
  setSnapshot: (snapshot: WorkoutStoreSnapshot | null) => void;
  setIsReady: (isReady: boolean) => void;
}

export const useWorkoutDataStore = create<WorkoutDataState>((set) => ({
  snapshot: null,
  isReady: false,
  setSnapshot: (snapshot) => set({ snapshot }),
  setIsReady: (isReady) => set({ isReady }),
}));
