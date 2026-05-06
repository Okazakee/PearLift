import type { PearLiftRuntimeState } from '../src/backup/types';
import {
  buildInitialWeights,
  defaultDayConfigs,
  defaultWeekConfigs,
  defaultWorkouts,
} from '../src/data/workouts';
import { resolveFirstSync } from '../src/sync/firstSync';
import type { WorkoutSession } from '../src/types';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

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

const defaultRuntime = runtime(defaultWorkouts);
const populatedRemote = runtime([
  {
    ...defaultWorkouts[0],
    name: 'Edited room baseline',
  },
]);

assertEqual(
  resolveFirstSync(defaultRuntime, populatedRemote, 1).kind,
  'auto_import_remote',
  'default local imports populated remote',
);

assertEqual(
  resolveFirstSync(defaultRuntime, defaultRuntime, 1).kind,
  'already_in_sync',
  'identical runtimes are already synced',
);

const identicalLocal = runtime([customWorkout('custom-a', 'exercise-a')]);
const identicalRemote = runtime([customWorkout('custom-a', 'exercise-a')]);
assertEqual(
  resolveFirstSync(identicalLocal, identicalRemote, 1).kind,
  'already_in_sync',
  'content-identical overlapping ids do not prompt',
);

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
assertEqual(
  resolveFirstSync(identicalLocal, divergentRemote, 1).kind,
  'requires_user_choice',
  'divergent overlapping ids prompt',
);

assertEqual(
  resolveFirstSync(
    runtime([customWorkout('custom-a', 'exercise-a')]),
    runtime([customWorkout('custom-b', 'exercise-b')]),
    1,
  ).kind,
  'auto_merge',
  'distinct non-overlapping data auto-merges',
);

assertEqual(
  resolveFirstSync(
    runtime([customWorkout('custom-a', 'exercise-a')]),
    runtime([customWorkout('custom-b', 'exercise-b')]),
    25,
  ).kind,
  'requires_user_choice',
  'large remote backlog prompts',
);
