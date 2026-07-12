import { describe, expect, test } from 'bun:test';
import { computeImportDiff, prepareImportRuntime } from '@/backup/diff';
import { toPearLiftBackupV3 } from '@/backup/serialization';
import type { PearLiftRuntimeState } from '@/backup/types';
import { buildDefaultRuntimeState } from '@/storage/repository/defaults';

function cloneRuntime(state: PearLiftRuntimeState): PearLiftRuntimeState {
  return JSON.parse(JSON.stringify(state)) as PearLiftRuntimeState;
}

function requireWorkout(state: PearLiftRuntimeState, index: number) {
  const workout = state.workouts[index];
  if (!workout) {
    throw new Error(`Missing workout at index ${index}`);
  }
  return workout;
}

describe('computeImportDiff', () => {
  test('captures workout, settings, week, and day changes', () => {
    const current = buildDefaultRuntimeState();
    const incoming = cloneRuntime(current);
    const day1 = requireWorkout(incoming, 0);
    const day2 = requireWorkout(incoming, 1);
    const day3 = requireWorkout(incoming, 2);
    current.userWeights['exercise-1-1'] = 32.5;
    const day3Exercise = day3.exercises[0];
    if (!day3Exercise) {
      throw new Error('Expected a seed exercise for day3');
    }

    day1.exercises.push({
      id: 'exercise-added-sync',
      name: 'Cable Fly',
      sets: 4,
      reps: '12',
      baseWeight: 17.5,
      muscleGroup: 'Chest',
      notes: 'Slow eccentric',
      position: day1.exercises.length,
    });
    incoming.userWeights['exercise-added-sync'] = 17.5;

    day2.exercises = day2.exercises.slice(1);
    delete incoming.userWeights['exercise-2-1'];

    day3.exercises[0] = {
      ...day3Exercise,
      reps: '10',
      notes: 'Paused top rep',
    };
    incoming.userWeights['exercise-3-1'] = 42.5;

    incoming.currentWeek = 3;
    incoming.currentDay = 'day3';
    incoming.restDuration = 210;
    incoming.themeMode = 'dark';
    incoming.weightUnit = 'lb';
    const currentProgram = incoming.program;
    if (!currentProgram) {
      throw new Error('Expected default program.');
    }
    incoming.program = {
      ...currentProgram,
      name: 'Blocco Intensità',
      subtitle: 'Forza + Ipertrofia',
      goal: 'Strength and hypertrophy',
      durationWeeks: 4,
      progressionModel: 'mixed',
      defaultRestSeconds: 135,
      frequencySummary: [
        { muscleGroup: 'Chest', targetPerWeek: 2 },
        { muscleGroup: 'Back', targetPerWeek: 2 },
      ],
    };

    incoming.weekConfigs = incoming.weekConfigs.map((week) =>
      week.id === 1
        ? {
            ...week,
            name: 'Accumulation',
            loadModifier: 1.1,
            volumeModifier: 0.9,
            rir: 3,
            notes: 'Drop one accessory set',
          }
        : week,
    );
    incoming.dayConfigs = incoming.dayConfigs.map((day) =>
      day.id === 'day1'
        ? {
            ...day,
            name: 'Upper',
            sessionLabel: 'A',
            icon: 'Dumbbell',
            schedule: {
              type: 'day_window',
              daysOfWeek: [1, 2],
              preferredDay: 1,
              label: 'Mon/Tue',
            },
          }
        : day,
    );

    const diff = computeImportDiff(
      toPearLiftBackupV3(current),
      toPearLiftBackupV3(incoming),
    );

    expect(diff.workouts.find((item) => item.workoutId === 'day1')).toEqual({
      workoutId: 'day1',
      name: 'Day 1',
      added: 1,
      removed: 0,
      modified: 0,
    });
    expect(diff.workouts.find((item) => item.workoutId === 'day2')).toEqual({
      workoutId: 'day2',
      name: 'Day 2',
      added: 0,
      removed: 1,
      modified: 0,
    });
    expect(diff.workouts.find((item) => item.workoutId === 'day3')).toEqual({
      workoutId: 'day3',
      name: 'Day 3',
      added: 0,
      removed: 0,
      modified: 1,
    });
    expect(diff.settings.map((item) => item.key)).toEqual([
      'Current Week',
      'Current Day',
      'Rest Duration',
      'Theme',
      'Weight Unit',
    ]);
    expect(diff.settings.find((item) => item.key === 'Weight Unit')).toEqual({
      key: 'Weight Unit',
      from: 'KG',
      to: 'LB',
    });
    expect(diff.programMetadata).toEqual([
      {
        key: 'Program Name',
        from: 'Main Program',
        to: 'Blocco Intensità',
      },
      {
        key: 'Subtitle',
        from: '-',
        to: 'Forza + Ipertrofia',
      },
      {
        key: 'Goal',
        from: '-',
        to: 'Strength and hypertrophy',
      },
      {
        key: 'Duration',
        from: '-',
        to: '4',
      },
      {
        key: 'Progression Model',
        from: 'simple_load_modifier',
        to: 'mixed',
      },
      {
        key: 'Program Default Rest',
        from: '-',
        to: '135',
      },
      {
        key: 'Frequency Summary',
        from: '-',
        to: 'Chest 2x/wk, Back 2x/wk',
      },
    ]);
    expect(diff.weekConfigs).toEqual([
      {
        key: 'Week 1',
        from: 'Week 1 (RIR 2, Load 0%, Volume 0%)',
        to: 'Accumulation (RIR 3, Load +10%, Volume -10%, Notes Drop one accessory set)',
      },
    ]);
    expect(diff.dayConfigs).toEqual([
      {
        key: 'Day day1',
        from: 'Day 1 (day1, Activity)',
        to: 'A · Upper (day1, Dumbbell, Mon/Tue)',
      },
    ]);
    expect(diff.incomingWorkoutCount).toBe(3);
    expect(diff.incomingExerciseCount).toBe(2);
    expect(diff.newExercises).toEqual([
      {
        exerciseId: 'exercise-added-sync',
        name: 'Cable Fly',
        workoutId: 'day1',
        workoutName: 'Day 1',
      },
    ]);
    expect(diff.changedExercises).toEqual([
      {
        exerciseId: 'exercise-3-1',
        name: day3Exercise.name,
        workoutId: 'day3',
        workoutName: 'Day 3',
      },
    ]);
    expect(diff.removedExercises).toEqual([
      {
        exerciseId: 'exercise-2-1',
        name: 'Overhead Press',
        workoutId: 'day2',
        workoutName: 'Day 2',
      },
    ]);
    expect(
      diff.preservedWeights.some((item) => item.exerciseId === 'exercise-1-1'),
    ).toBe(true);
    expect(diff.totalChanges).toBe(17);
  });

  test('flags missing-weight imports and preserves matching local weights', () => {
    const current = buildDefaultRuntimeState();
    const currentDay1 = requireWorkout(current, 0);
    const currentExercise = currentDay1.exercises[0];
    if (!currentExercise) {
      throw new Error('Expected a seed exercise for day1');
    }
    currentDay1.exercises[0] = {
      ...currentExercise,
      id: 'sissy-squat',
      name: 'Sissy Squat',
    };
    current.userWeights['sissy-squat'] = 35;
    current.userWeights['exercise-1-2'] = 42.5;

    const incoming = cloneRuntime(current);
    const incomingDay1 = requireWorkout(incoming, 0);
    incomingDay1.exercises = incomingDay1.exercises.slice(1);
    incomingDay1.exercises.push({
      id: 'walking-lunges',
      name: 'Affondi in Camminata',
      sets: 3,
      reps: '6-8 per leg',
      baseWeight: 0,
      muscleGroup: 'Legs',
      notes: '',
      position: incomingDay1.exercises.length,
    });
    delete incoming.userWeights['sissy-squat'];
    incoming.userWeights['exercise-1-2'] = 10;

    const diff = computeImportDiff(
      toPearLiftBackupV3(current),
      toPearLiftBackupV3(incoming),
    );

    expect(diff.missingWeightExercises).toEqual([
      {
        exerciseId: 'walking-lunges',
        name: 'Affondi in Camminata',
        workoutId: 'day1',
        workoutName: 'Day 1',
      },
    ]);
    expect(diff.removedExercises).toEqual([
      {
        exerciseId: 'sissy-squat',
        name: 'Sissy Squat',
        workoutId: 'day1',
        workoutName: 'Day 1',
      },
    ]);

    const prepared = prepareImportRuntime(current, incoming);
    expect(prepared.userWeights['exercise-1-2']).toBe(42.5);
    expect(Object.hasOwn(prepared.userWeights, 'walking-lunges')).toBe(false);
  });

  test('treats canonical identity changes as modified exercises', () => {
    const current = buildDefaultRuntimeState();
    const incoming = cloneRuntime(current);
    const day1 = requireWorkout(incoming, 0);
    const exercise = day1.exercises[0];
    if (!exercise) {
      throw new Error('Expected a seed exercise for day1');
    }

    day1.exercises[0] = {
      ...exercise,
      canonicalExerciseId: 'bench-press',
      variantLabel: 'Session A',
      sessionSpecific: true,
    };

    const diff = computeImportDiff(
      toPearLiftBackupV3(current),
      toPearLiftBackupV3(incoming),
    );

    expect(diff.changedExercises).toEqual([
      {
        exerciseId: exercise.id,
        name: exercise.name,
        workoutId: 'day1',
        workoutName: 'Day 1',
      },
    ]);
  });
});
