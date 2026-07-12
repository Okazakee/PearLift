import { describe, expect, test } from 'bun:test';
import type {
  UserExerciseSettingsMap,
  UserWeights,
  WorkoutSessionLog,
} from '@/types';
import { buildProgressionSuggestions } from '@/utils/progression';

function logWithRule(input: {
  exerciseId: string;
  exerciseName: string;
  incrementKg: number;
  targetReps: number;
  requiredRir?: number;
  requiredSets?: number;
  sets: Array<{
    actualReps?: number;
    actualLeftReps?: number;
    actualRightReps?: number;
    actualRir?: number;
    completed: boolean;
    skipped?: boolean;
  }>;
}): WorkoutSessionLog {
  return {
    id: `log:${input.exerciseId}`,
    workoutId: 'day1',
    workoutNameSnapshot: 'Push',
    startedAt: '2026-06-26T10:00:00.000Z',
    completedAt: '2026-06-26T10:30:00.000Z',
    exerciseLogs: [
      {
        exerciseId: input.exerciseId,
        exerciseNameSnapshot: input.exerciseName,
        plannedWeight: 60,
        prescriptionSnapshot: {
          id: input.exerciseId,
          name: input.exerciseName,
          sets: input.sets.length,
          reps: `4-${input.targetReps}`,
          baseWeight: 0,
          muscleGroup: 'Chest',
          notes: '',
          position: 0,
          advanced: {
            progressionRule: {
              type: 'load_increment_when_top_reps_at_rir',
              label: `+${input.incrementKg} kg rule`,
              incrementKg: input.incrementKg,
              targetReps: input.targetReps,
              requiredRir: input.requiredRir,
              requiredSets: input.requiredSets,
              scope: 'all_sets',
            },
          },
        },
        sets: input.sets.map((set, index) => ({
          setNumber: index + 1,
          targetRepsLabel: String(input.targetReps),
          plannedWeight: 60,
          actualReps: set.actualReps,
          actualLeftReps: set.actualLeftReps,
          actualRightReps: set.actualRightReps,
          actualRir: set.actualRir,
          completed: set.completed,
          skipped: set.skipped,
        })),
      },
    ],
  };
}

describe('progression suggestions', () => {
  test('triggers +5 kg when 4 x 6 with 2 RIR matches the rule', () => {
    const log = logWithRule({
      exerciseId: 'multipower',
      exerciseName: 'MultiPower Press 30°',
      incrementKg: 5,
      targetReps: 6,
      requiredRir: 2,
      sets: [
        { actualReps: 6, actualRir: 2, completed: true },
        { actualReps: 6, actualRir: 2, completed: true },
        { actualReps: 6, actualRir: 2, completed: true },
        { actualReps: 6, actualRir: 2, completed: true },
      ],
    });
    const userWeights: UserWeights = { multipower: 62 };

    expect(
      buildProgressionSuggestions({
        workoutLog: log,
        userWeights,
      }),
    ).toEqual([
      {
        id: 'log:multipower:multipower:+5 kg rule',
        workoutLogId: 'log:multipower',
        exerciseId: 'multipower',
        exerciseName: 'MultiPower Press 30°',
        ruleLabel: '+5 kg rule',
        reason: 'Completed 4 x 6 at RIR 2 or lower',
        incrementKg: 5,
        currentWeightKg: 62,
        suggestedWeightKg: 67,
      },
    ]);
  });

  test('triggers +2.5 kg when 3 x 7 with 2 RIR matches the rule', () => {
    const log = logWithRule({
      exerciseId: 'shoulder',
      exerciseName: 'Shoulder Press Manubri',
      incrementKg: 2.5,
      targetReps: 7,
      requiredRir: 2,
      requiredSets: 3,
      sets: [
        { actualReps: 7, actualRir: 2, completed: true },
        { actualReps: 7, actualRir: 2, completed: true },
        { actualReps: 7, actualRir: 2, completed: true },
      ],
    });

    const suggestions = buildProgressionSuggestions({
      workoutLog: log,
      userWeights: { shoulder: 24 },
    });

    expect(suggestions[0]?.reason).toBe('Completed 3 x 7 at RIR 2 or lower');
    expect(suggestions[0]?.suggestedWeightKg).toBe(26.5);
  });

  test('prefers exercise settings working weight over legacy user weights', () => {
    const log = logWithRule({
      exerciseId: 'db-press',
      exerciseName: 'DB Press',
      incrementKg: 2.5,
      targetReps: 8,
      requiredRir: 2,
      sets: [
        { actualReps: 8, actualRir: 2, completed: true },
        { actualReps: 8, actualRir: 2, completed: true },
        { actualReps: 8, actualRir: 2, completed: true },
      ],
    });
    const userExerciseSettings: UserExerciseSettingsMap = {
      'db-press': {
        exerciseId: 'db-press',
        workingWeight: 30,
        weightUnit: 'kg',
        weightMode: 'per_hand',
        updatedAt: '2026-06-26T12:00:00.000Z',
      },
    };

    const suggestions = buildProgressionSuggestions({
      workoutLog: log,
      userExerciseSettings,
      userWeights: { 'db-press': 24 },
    });

    expect(suggestions[0]?.reason).toBe('Completed 3 x 8 at RIR 2 or lower');
    expect(suggestions[0]?.currentWeightKg).toBe(30);
    expect(suggestions[0]?.suggestedWeightKg).toBe(32.5);
  });

  test('avoids false positives when reps or RIR are missing', () => {
    const missingRir = logWithRule({
      exerciseId: 'press',
      exerciseName: 'Press',
      incrementKg: 5,
      targetReps: 6,
      requiredRir: 2,
      sets: [
        { actualReps: 6, completed: true },
        { actualReps: 6, actualRir: 2, completed: true },
        { actualReps: 6, actualRir: 2, completed: true },
        { actualReps: 6, actualRir: 2, completed: true },
      ],
    });
    const skippedSet = logWithRule({
      exerciseId: 'row',
      exerciseName: 'Row',
      incrementKg: 5,
      targetReps: 7,
      sets: [
        { actualReps: 7, completed: true },
        { actualReps: 7, completed: true, skipped: true },
        { actualReps: 7, completed: true },
        { actualReps: 7, completed: true },
      ],
    });

    expect(
      buildProgressionSuggestions({
        workoutLog: missingRir,
        userWeights: { press: 60 },
      }).length,
    ).toBe(0);
    expect(
      buildProgressionSuggestions({
        workoutLog: skippedSet,
        userWeights: { row: 70 },
      }).length,
    ).toBe(0);
  });

  test('uses the weaker unilateral side when evaluating a progression rule', () => {
    const log = logWithRule({
      exerciseId: 'split-squat',
      exerciseName: 'Split Squat',
      incrementKg: 2.5,
      targetReps: 8,
      requiredSets: 2,
      sets: [
        {
          actualLeftReps: 8,
          actualRightReps: 8,
          completed: true,
        },
        {
          actualLeftReps: 7,
          actualRightReps: 8,
          completed: true,
        },
      ],
    });

    expect(
      buildProgressionSuggestions({
        workoutLog: log,
        userWeights: { 'split-squat': 20 },
      }),
    ).toEqual([]);
  });
});
