import type { WorkoutMutation, WorkoutStoreSnapshot } from '@/storage/types';
import type { SyncMutation } from '@/sync/types';

export function canonicalizeMutationForSync(
  mutation: WorkoutMutation,
  snapshot: WorkoutStoreSnapshot | null,
): SyncMutation | null {
  if (mutation.type === 'adjustExerciseWeight') {
    const value = snapshot?.userWeights[mutation.exerciseId] ?? 0;
    return {
      type: 'setExerciseWeight',
      exerciseId: mutation.exerciseId,
      value,
    };
  }

  switch (mutation.type) {
    case 'setExerciseWeight':
    case 'addExercise':
    case 'editExercise':
    case 'deleteExercise':
    case 'reorderExercises':
    case 'replaceWeekConfigs':
    case 'replaceDayConfigs':
      return mutation;
    default:
      return null;
  }
}
