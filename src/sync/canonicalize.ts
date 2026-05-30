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

  if (mutation.type === 'addExercise') {
    const workout = snapshot?.workouts.find(
      (w) => w.id === mutation.workoutId,
    );
    const existing = workout?.exercises.find(
      (e) =>
        e.name === mutation.exercise.name &&
        e.muscleGroup === mutation.exercise.muscleGroup,
    );
    return {
      ...mutation,
      exercise: {
        ...mutation.exercise,
        id: existing?.id ?? mutation.exercise.id,
      },
    };
  }

  switch (mutation.type) {
    case 'setExerciseWeight':
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
