import { describe, expect, test } from 'bun:test';
import type { PearLiftRuntimeState } from '@/backup/types';
import { defaultDayConfigs, defaultWeekConfigs } from '@/data/workouts';
import { applyOpsToRuntimePreview, mutationsConflict } from '@/sync/conflicts';
import { mergeDisjointRuntime, summarizeRuntime } from '@/sync/firstSync';
import type { SyncOpEnvelope } from '@/sync/types';
import { SYNC_OP_SCHEMA_VERSION } from '@/sync/types';

function buildRuntime(): PearLiftRuntimeState {
  return {
    workouts: [
      {
        id: 'day1',
        name: 'Day 1',
        description: 'Push',
        exercises: [
          {
            id: 'exercise-1',
            name: 'Bench Press',
            sets: 3,
            reps: '8',
            baseWeight: 80,
            muscleGroup: 'Chest',
            notes: '',
            position: 0,
          },
          {
            id: 'exercise-2',
            name: 'Incline Press',
            sets: 3,
            reps: '10',
            baseWeight: 30,
            muscleGroup: 'Chest',
            notes: '',
            position: 1,
          },
        ],
      },
    ],
    userWeights: {
      'exercise-1': 82.5,
      'exercise-2': 32.5,
    },
    weekConfigs: defaultWeekConfigs,
    dayConfigs: defaultDayConfigs,
    currentWeek: 1,
    currentDay: defaultDayConfigs[0]?.id ?? 'day1',
    restDuration: 150,
    themeMode: 'system',
    weightUnit: 'kg',
    language: 'system',
  };
}

function mutationOp(
  opId: string,
  mutation: SyncOpEnvelope['mutation'],
): SyncOpEnvelope {
  if (!mutation) {
    throw new Error('Mutation is required.');
  }
  return {
    schemaVersion: SYNC_OP_SCHEMA_VERSION,
    opId,
    deviceId: 'device-a',
    lamport: 1,
    createdAt: '2026-05-29T10:00:00.000Z',
    mutation,
  };
}

describe('mutationsConflict', () => {
  test('treats reorder and add in the same workout as conflicting', () => {
    expect(
      mutationsConflict(
        {
          type: 'reorderExercises',
          workoutId: 'day1',
          orderedExerciseIds: ['exercise-2', 'exercise-1'],
        },
        {
          type: 'addExercise',
          workoutId: 'day1',
          exercise: {
            name: 'Cable Fly',
            sets: 3,
            reps: '12',
            muscleGroup: 'Chest',
            notes: '',
          },
        },
      ),
    ).toBe(true);
  });

  test('does not mark unrelated workout reorders as conflicts', () => {
    expect(
      mutationsConflict(
        {
          type: 'reorderExercises',
          workoutId: 'day1',
          orderedExerciseIds: ['exercise-2', 'exercise-1'],
        },
        {
          type: 'addExercise',
          workoutId: 'day2',
          exercise: {
            name: 'Row',
            sets: 4,
            reps: '10',
            muscleGroup: 'Back',
            notes: '',
          },
        },
      ),
    ).toBe(false);
  });

  test('treats delete and weight writes for the same exercise as conflicting', () => {
    expect(
      mutationsConflict(
        {
          type: 'deleteExercise',
          workoutId: 'day1',
          exerciseId: 'exercise-1',
        },
        {
          type: 'setExerciseWeight',
          exerciseId: 'exercise-1',
          value: 90,
        },
      ),
    ).toBe(true);
  });
});

describe('applyOpsToRuntimePreview', () => {
  test('applies snapshot replace, weight writes, and reorders in sequence', () => {
    const baseRuntime = buildRuntime();
    const baseWorkout = baseRuntime.workouts[0];
    if (!baseWorkout) {
      throw new Error('Expected a base workout.');
    }
    const remoteSnapshot: PearLiftRuntimeState = {
      ...baseRuntime,
      workouts: [
        {
          ...baseWorkout,
          exercises: [...baseWorkout.exercises].reverse(),
        },
      ],
    };

    const preview = applyOpsToRuntimePreview(
      baseRuntime,
      [
        {
          schemaVersion: SYNC_OP_SCHEMA_VERSION,
          opId: 'snapshot',
          deviceId: 'device-b',
          lamport: 2,
          createdAt: '2026-05-29T10:01:00.000Z',
          payload: {
            kind: 'snapshot_replace',
            runtime: remoteSnapshot,
            summary: summarizeRuntime(remoteSnapshot),
          },
        },
        mutationOp('weight', {
          type: 'setExerciseWeight',
          exerciseId: 'exercise-1',
          value: 95,
        }),
        mutationOp('reorder', {
          type: 'reorderExercises',
          workoutId: 'day1',
          orderedExerciseIds: ['exercise-1', 'exercise-2'],
        }),
      ],
      (op) => {
        if (op.payload) return op.payload;
        if (op.mutation) {
          return { kind: 'mutation', mutation: op.mutation };
        }
        throw new Error('Missing payload.');
      },
    );

    expect(preview.userWeights['exercise-1']).toBe(95);
    expect(preview.workouts[0]?.exercises.map((item) => item.id)).toEqual([
      'exercise-1',
      'exercise-2',
    ]);
    expect(preview.workouts[0]?.exercises.map((item) => item.position)).toEqual(
      [0, 1],
    );
  });
});

describe('mergeDisjointRuntime', () => {
  test('merges remote data while preserving local preferences', () => {
    const local = buildRuntime();
    const remote: PearLiftRuntimeState = {
      ...buildRuntime(),
      workouts: [
        {
          id: 'day9',
          name: 'Travel Day',
          description: 'Remote',
          exercises: [
            {
              id: 'remote-1',
              name: 'Goblet Squat',
              sets: 4,
              reps: '12',
              baseWeight: 20,
              muscleGroup: 'Legs',
              notes: '',
              position: 0,
            },
          ],
        },
      ],
      userWeights: {
        'remote-1': 22.5,
      },
      weekConfigs: [{ id: 11, name: 'Remote 1', loadModifier: 0.9, rir: 3 }],
      dayConfigs: [{ id: 'remote-day', name: 'Remote Day', icon: 'Activity' }],
      currentWeek: 11,
      currentDay: 'remote-day',
      restDuration: 210,
      themeMode: 'dark',
      weightUnit: 'lb',
      language: 'ro',
    };

    const merged = mergeDisjointRuntime(local, remote);

    expect(merged.workouts.map((item) => item.id)).toEqual(['day9', 'day1']);
    expect(merged.userWeights).toEqual({
      'remote-1': 22.5,
      'exercise-1': 82.5,
      'exercise-2': 32.5,
    });
    expect(merged.currentWeek).toBe(local.currentWeek);
    expect(merged.currentDay).toBe(local.currentDay);
    expect(merged.restDuration).toBe(local.restDuration);
    expect(merged.themeMode).toBe(local.themeMode);
    expect(merged.weightUnit).toBe(local.weightUnit);
    expect(merged.language).toBe(local.language);
  });
});
