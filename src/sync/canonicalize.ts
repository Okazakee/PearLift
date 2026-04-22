import type { WorkoutMutation, WorkoutStoreSnapshot } from '../storage/types';
import type { SyncMutation } from './types';

export function canonicalizeMutationForSync(
  mutation: WorkoutMutation,
  snapshot: WorkoutStoreSnapshot | null,
): SyncMutation | null {
  if (
    mutation.type === 'resetWorkoutData' ||
    mutation.type === 'resetAllData' ||
    mutation.type === 'restoreRuntimeState'
  ) {
    return null;
  }

  if (mutation.type === 'adjustExerciseWeight') {
    const value = snapshot?.userWeights[mutation.exerciseId] ?? 0;
    return {
      type: 'setExerciseWeight',
      exerciseId: mutation.exerciseId,
      value,
    };
  }

  return mutation;
}
