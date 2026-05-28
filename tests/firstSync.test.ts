import { describe, expect, test } from 'bun:test';
import type { PearLiftRuntimeState } from '@/backup/types';
import {
  buildInitialWeights,
  defaultDayConfigs,
  defaultWeekConfigs,
  defaultWorkouts,
} from '@/data/workouts';
import { resolveFirstSync } from '@/sync/firstSync';
import type { WorkoutSession } from '@/types';

function runtime(workouts: WorkoutSession[]): PearLiftRuntimeState {
  return {
    workouts,
    userWeights: buildInitialWeights(workouts),
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

function runtimeWithConfigOffset(
  workouts: WorkoutSession[],
  offset: number,
): PearLiftRuntimeState {
  return {
    ...runtime(workouts),
    weekConfigs: defaultWeekConfigs.map((week) => ({
      ...week,
      id: week.id + offset,
    })),
    dayConfigs: defaultDayConfigs.map((day) => ({
      ...day,
      id: `${day.id}-${offset}`,
    })),
    currentDay: `${defaultDayConfigs[0]?.id ?? 'day1'}-${offset}`,
  };
}

function customWorkout(id: string, exerciseId: string): WorkoutSession {
  return {
    id,
    name: id,
    description: 'Custom',
    exercises: [
      {
        id: exerciseId,
        name: exerciseId,
        sets: 3,
        reps: '8',
        baseWeight: 10,
        muscleGroup: 'Chest',
        notes: '',
        position: 0,
      },
    ],
  };
}

describe('resolveFirstSync', () => {
  test('imports populated remote into default local runtime', () => {
    const defaultRuntime = runtime(defaultWorkouts);
    const populatedRemote = runtime([
      {
        ...defaultWorkouts[0],
        name: 'Edited room baseline',
      },
    ]);

    expect(resolveFirstSync(defaultRuntime, populatedRemote, 1).kind).toBe(
      'auto_import_remote',
    );
  });

  test('returns already_in_sync for identical runtimes', () => {
    const defaultRuntime = runtime(defaultWorkouts);
    expect(resolveFirstSync(defaultRuntime, defaultRuntime, 1).kind).toBe(
      'already_in_sync',
    );
  });

  test('returns already_in_sync for identical overlapping ids', () => {
    const identicalLocal = runtime([customWorkout('custom-a', 'exercise-a')]);
    const identicalRemote = runtime([customWorkout('custom-a', 'exercise-a')]);

    expect(resolveFirstSync(identicalLocal, identicalRemote, 1).kind).toBe(
      'already_in_sync',
    );
  });

  test('prompts on divergent overlapping ids', () => {
    const identicalLocal = runtime([customWorkout('custom-a', 'exercise-a')]);
    const divergentRemote = runtime([
      {
        ...customWorkout('custom-a', 'exercise-a'),
        exercises: [
          {
            ...customWorkout('custom-a', 'exercise-a').exercises[0],
            reps: '12',
          },
        ],
      },
    ]);

    expect(resolveFirstSync(identicalLocal, divergentRemote, 1).kind).toBe(
      'requires_user_choice',
    );
  });

  test('auto-merges non-overlapping data', () => {
    expect(
      resolveFirstSync(
        runtimeWithConfigOffset([customWorkout('custom-a', 'exercise-a')], 0),
        runtimeWithConfigOffset([customWorkout('custom-b', 'exercise-b')], 10),
        1,
      ).kind,
    ).toBe('auto_merge');
  });

  test('prompts on large remote backlog', () => {
    expect(
      resolveFirstSync(
        runtimeWithConfigOffset([customWorkout('custom-a', 'exercise-a')], 0),
        runtimeWithConfigOffset([customWorkout('custom-b', 'exercise-b')], 10),
        25,
      ).kind,
    ).toBe('requires_user_choice');
  });
});
