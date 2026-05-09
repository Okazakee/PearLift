import type { SyncMutation } from '@/sync/types';

export function coalescePublishQueue(
  queue: SyncMutation[],
  mutation: SyncMutation,
): SyncMutation[] {
  switch (mutation.type) {
    case 'setExerciseWeight':
      return [
        ...queue.filter(
          (item) =>
            item.type !== 'setExerciseWeight' ||
            item.exerciseId !== mutation.exerciseId,
        ),
        mutation,
      ];
    case 'reorderExercises':
      return [
        ...queue.filter(
          (item) =>
            item.type !== 'reorderExercises' ||
            item.workoutId !== mutation.workoutId,
        ),
        mutation,
      ];
    case 'replaceWeekConfigs':
      return [
        ...queue.filter((item) => item.type !== 'replaceWeekConfigs'),
        mutation,
      ];
    case 'replaceDayConfigs':
      return [
        ...queue.filter((item) => item.type !== 'replaceDayConfigs'),
        mutation,
      ];
    default:
      return [...queue, mutation];
  }
}
