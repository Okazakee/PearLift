import { describe, expect, test } from 'bun:test';
import { defaultDayConfigs, defaultWeekConfigs } from '@/data/workouts';
import type { WorkoutStoreSnapshot } from '@/storage/types';
import { canonicalizeMutationForSync } from '@/sync/canonicalize';
import { coalescePublishQueue } from '@/sync/coalesce';
import type { SyncMutation } from '@/sync/types';

const baseSnapshot: WorkoutStoreSnapshot = {
  workouts: [],
  userWeights: {
    bench: 82.5,
  },
  weekConfigs: defaultWeekConfigs,
  dayConfigs: defaultDayConfigs,
  currentWeek: 1,
  currentDay: defaultDayConfigs[0]?.id ?? 'push',
  restDuration: 150,
  themeMode: 'system',
  weightUnit: 'kg',
  language: 'system',
  isSetupDone: true,
};

describe('canonicalizeMutationForSync', () => {
  test('converts adjustExerciseWeight into a setExerciseWeight mutation', () => {
    expect(
      canonicalizeMutationForSync(
        {
          type: 'adjustExerciseWeight',
          exerciseId: 'bench',
          delta: 2.5,
        },
        baseSnapshot,
      ),
    ).toEqual({
      type: 'setExerciseWeight',
      exerciseId: 'bench',
      value: 82.5,
    });
  });

  test('returns null for non-syncable mutations', () => {
    expect(
      canonicalizeMutationForSync(
        { type: 'setCurrentWeek', currentWeek: 2 },
        baseSnapshot,
      ),
    ).toBeNull();
  });
});

describe('coalescePublishQueue', () => {
  test('replaces prior exercise weight writes for the same exercise', () => {
    const queue: SyncMutation[] = [
      { type: 'setExerciseWeight', exerciseId: 'bench', value: 80 },
      { type: 'setExerciseWeight', exerciseId: 'row', value: 60 },
    ];

    expect(
      coalescePublishQueue(queue, {
        type: 'setExerciseWeight',
        exerciseId: 'bench',
        value: 85,
      }),
    ).toEqual([
      { type: 'setExerciseWeight', exerciseId: 'row', value: 60 },
      { type: 'setExerciseWeight', exerciseId: 'bench', value: 85 },
    ]);
  });

  test('replaces prior replaceWeekConfigs mutations', () => {
    const queue: SyncMutation[] = [
      {
        type: 'replaceWeekConfigs',
        weekConfigs: [{ id: 1, name: 'W1', loadModifier: 1, rir: 2 }],
      },
      {
        type: 'addExercise',
        workoutId: 'push',
        exercise: {
          name: 'Bench',
          sets: 3,
          reps: '8',
          muscleGroup: 'Chest',
          notes: '',
        },
      },
    ];

    expect(
      coalescePublishQueue(queue, {
        type: 'replaceWeekConfigs',
        weekConfigs: [{ id: 1, name: 'W1b', loadModifier: 0.9, rir: 3 }],
      }),
    ).toEqual([
      {
        type: 'addExercise',
        workoutId: 'push',
        exercise: {
          name: 'Bench',
          sets: 3,
          reps: '8',
          muscleGroup: 'Chest',
          notes: '',
        },
      },
      {
        type: 'replaceWeekConfigs',
        weekConfigs: [{ id: 1, name: 'W1b', loadModifier: 0.9, rir: 3 }],
      },
    ]);
  });
});
