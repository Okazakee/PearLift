import { describe, expect, test } from 'bun:test';
import { computeImportDiff } from '@/backup/diff';
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

    incoming.weekConfigs = incoming.weekConfigs.map((week) =>
      week.id === 1
        ? { ...week, name: 'Accumulation', loadModifier: 1.1, rir: 3 }
        : week,
    );
    incoming.dayConfigs = incoming.dayConfigs.map((day) =>
      day.id === 'day1' ? { ...day, name: 'Upper A', icon: 'Dumbbell' } : day,
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
    expect(diff.weekConfigs).toEqual([
      {
        key: 'Week 1',
        from: 'Week 1 (RIR 2, Load 0%)',
        to: 'Accumulation (RIR 3, Load +10%)',
      },
    ]);
    expect(diff.dayConfigs).toEqual([
      {
        key: 'Day day1',
        from: 'Day 1 (day1, Activity)',
        to: 'Upper A (day1, Dumbbell)',
      },
    ]);
    expect(diff.totalChanges).toBe(10);
  });
});
