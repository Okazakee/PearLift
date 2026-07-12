import { describe, expect, test } from 'bun:test';
import type { Exercise } from '@/types';
import {
  getActiveWeekOverride,
  getExerciseTargetForWeek,
} from '@/utils/exerciseTargets';

function buildExercise(): Exercise {
  return {
    id: 'curl',
    name: 'Alternating Curl',
    sets: 3,
    reps: '6-8',
    baseWeight: 12,
    muscleGroup: 'Biceps',
    notes: 'Base target',
    position: 0,
    advanced: {
      restSeconds: 90,
      rir: {
        type: 'range',
        min: 1,
        max: 2,
        label: '1-2',
      },
      weekOverrides: [
        {
          week: 3,
          sets: 4,
          restSeconds: 120,
          notes: 'Add one set from week 3',
          rir: {
            type: 'fixed',
            value: 1,
            label: '1',
          },
        },
      ],
    },
  };
}

describe('exercise week targets', () => {
  test('returns the base target before overrides begin', () => {
    const exercise = buildExercise();

    expect(getExerciseTargetForWeek(exercise, 1)).toBe(exercise);
    expect(getExerciseTargetForWeek(exercise, 2)).toBe(exercise);
  });

  test('applies the latest matching override for the active week', () => {
    const resolved = getExerciseTargetForWeek(buildExercise(), 3);

    expect(resolved.sets).toBe(4);
    expect(resolved.reps).toBe('6-8');
    expect(resolved.notes).toBe('Add one set from week 3');
    expect(resolved.advanced?.restSeconds).toBe(120);
    expect(resolved.advanced?.rir?.label).toBe('1');
  });

  test('keeps applying overrides beyond week 4 without hardcoded limits', () => {
    const resolved = getExerciseTargetForWeek(buildExercise(), 7);

    expect(resolved.sets).toBe(4);
    expect(resolved.advanced?.restSeconds).toBe(120);
  });

  test('returns the latest active override for the current week', () => {
    const exercise = buildExercise();

    expect(getActiveWeekOverride(exercise, 2)).toBe(undefined);
    expect(getActiveWeekOverride(exercise, 3)?.week).toBe(3);
    expect(getActiveWeekOverride(exercise, 7)?.week).toBe(3);
  });
});
