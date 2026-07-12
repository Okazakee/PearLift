import { describe, expect, test } from 'bun:test';
import { defaultWorkouts } from '@/data/workouts';
import type {
  ExerciseRirTarget,
  WorkoutSession,
  WorkoutSessionLog,
} from '@/types';
import {
  buildWorkoutSessionLog,
  countLoggedWorkoutSets,
  finalizeWorkoutSession,
  getEffectiveLoggedReps,
  getExerciseHistorySummary,
  getQuickCompleteReps,
  hasExplicitExerciseRirTarget,
  updateWorkoutLogSet,
} from '@/utils/workoutLog';

function getWorkout() {
  const workout = defaultWorkouts[0];
  if (!workout) {
    throw new Error('Missing default workout.');
  }
  return workout;
}

describe('workout log helpers', () => {
  test('builds a workout session snapshot with target rows', () => {
    const workout: WorkoutSession = {
      ...getWorkout(),
      defaultRestSeconds: 135,
      exercises: [
        {
          id: 'press',
          name: 'Press',
          sets: 3,
          reps: '6-8',
          baseWeight: 0,
          muscleGroup: 'Chest',
          notes: '',
          position: 0,
          advanced: {
            unilateral: {
              enabled: true,
              sideMode: 'per_side',
              countBothSidesAsOneSet: true,
              label: 'per side',
            },
          },
        },
      ],
    };
    const session = buildWorkoutSessionLog({
      workout,
      currentWeek: 1,
      weekRir: 2,
      settingsRestSeconds: 150,
      getAdjustedWeight: () => 42.5,
    });

    expect(session.workoutId).toBe(workout.id);
    expect(session.weekNumber).toBe(1);
    expect(session.exerciseLogs[0]?.plannedWeight).toBe(42.5);
    expect(session.exerciseLogs[0]?.sets.length).toBe(
      workout.exercises[0]?.sets ?? 0,
    );
    expect(session.exerciseLogs[0]?.sets[0]?.targetRepsLabel).toBe(
      '6-8 / side',
    );
    expect(session.exerciseLogs[0]?.sets[0]?.targetRir).toBe(2);
    expect(
      session.exerciseLogs[0]?.prescriptionSnapshot?.advanced?.restSeconds,
    ).toBe(135);
    expect(countLoggedWorkoutSets(session)).toEqual({
      logged: 0,
      total: workout.exercises.reduce((sum, item) => sum + item.sets, 0),
    });
  });

  test('uses the top rep number for quick completion', () => {
    expect(getQuickCompleteReps('5-7')).toBe(7);
    expect(getQuickCompleteReps('AMRAP')).toBe(undefined);
  });

  test('prefers shared reps and falls back to the weaker side for unilateral logs', () => {
    expect(
      getEffectiveLoggedReps({
        setNumber: 1,
        actualReps: 9,
        actualLeftReps: 7,
        actualRightReps: 8,
        completed: true,
      }),
    ).toBe(9);

    expect(
      getEffectiveLoggedReps({
        setNumber: 1,
        actualLeftReps: 7,
        actualRightReps: 8,
        completed: true,
      }),
    ).toBe(7);
  });

  test('detects explicit exercise RIR targets without treating week defaults as advanced RIR', () => {
    expect(
      hasExplicitExerciseRirTarget({
        id: 'bench',
        name: 'Bench Press',
        sets: 3,
        reps: '6',
        baseWeight: 0,
        muscleGroup: 'Chest',
        notes: '',
        position: 0,
      }),
    ).toBe(false);

    expect(
      hasExplicitExerciseRirTarget({
        id: 'bench',
        name: 'Bench Press',
        sets: 3,
        reps: '6',
        baseWeight: 0,
        muscleGroup: 'Chest',
        notes: '',
        position: 0,
        advanced: {
          weekOverrides: [
            {
              week: 3,
              rir: {
                type: 'fixed',
                label: '1',
                value: 1,
              },
            },
          ],
        },
      }),
    ).toBe(true);
  });

  test('resolves last-set RIR overrides only on the final set', () => {
    const workout: WorkoutSession = {
      ...getWorkout(),
      exercises: [
        {
          id: 'bench',
          name: 'Bench Press',
          sets: 3,
          reps: '6',
          baseWeight: 0,
          muscleGroup: 'Chest',
          notes: '',
          position: 0,
          advanced: {
            rir: {
              type: 'last_set_override',
              label: 'Last set 0',
              value: 2,
              lastSet: 0,
            } satisfies ExerciseRirTarget,
          },
        },
      ],
    };
    const session = buildWorkoutSessionLog({
      workout,
      currentWeek: 1,
      settingsRestSeconds: 150,
      getAdjustedWeight: () => 60,
    });

    expect(session.exerciseLogs[0]?.sets[0]?.targetRir).toBe(2);
    expect(session.exerciseLogs[0]?.sets[2]?.targetRir).toBe(0);
  });

  test('resolves per-set RIR targets by set number', () => {
    const workout: WorkoutSession = {
      ...getWorkout(),
      exercises: [
        {
          id: 'bench',
          name: 'Bench Press',
          sets: 3,
          reps: '6',
          baseWeight: 0,
          muscleGroup: 'Chest',
          notes: '',
          position: 0,
          advanced: {
            rir: {
              type: 'per_set',
              label: '2 / 1 / 0',
              values: [2, 1, 0],
            } satisfies ExerciseRirTarget,
          },
        },
      ],
    };
    const session = buildWorkoutSessionLog({
      workout,
      currentWeek: 1,
      weekRir: 3,
      settingsRestSeconds: 150,
      getAdjustedWeight: () => 60,
    });

    expect(session.exerciseLogs[0]?.sets[0]?.targetRir).toBe(2);
    expect(session.exerciseLogs[0]?.sets[1]?.targetRir).toBe(1);
    expect(session.exerciseLogs[0]?.sets[2]?.targetRir).toBe(0);
  });

  test('resolves per-set target overrides for reps and RIR', () => {
    const workout: WorkoutSession = {
      ...getWorkout(),
      exercises: [
        {
          id: 'bench',
          name: 'Bench Press',
          sets: 4,
          reps: '6-8',
          baseWeight: 0,
          muscleGroup: 'Chest',
          notes: '',
          position: 0,
          advanced: {
            perSetTargets: [
              {
                setNumber: 2,
                reps: '8',
              },
              {
                setNumber: 4,
                reps: '10-12',
                rir: {
                  type: 'fixed',
                  label: '0',
                  value: 0,
                },
              },
            ],
          },
        },
      ],
    };
    const session = buildWorkoutSessionLog({
      workout,
      currentWeek: 1,
      weekRir: 3,
      settingsRestSeconds: 150,
      getAdjustedWeight: () => 60,
    });
    const exercise = workout.exercises[0];
    if (!exercise) {
      throw new Error('Missing exercise.');
    }

    expect(hasExplicitExerciseRirTarget(exercise)).toBe(true);
    expect(session.exerciseLogs[0]?.sets[0]?.targetRepsLabel).toBe('6-8');
    expect(session.exerciseLogs[0]?.sets[1]?.targetRepsLabel).toBe('8');
    expect(session.exerciseLogs[0]?.sets[3]?.targetRepsLabel).toBe('10-12');
    expect(session.exerciseLogs[0]?.sets[0]?.targetRir).toBe(3);
    expect(session.exerciseLogs[0]?.sets[3]?.targetRir).toBe(0);
  });

  test('updates set status and marks a session complete when all sets are done', () => {
    const workout: WorkoutSession = {
      ...getWorkout(),
      exercises: [
        {
          id: 'bench',
          name: 'Bench Press',
          sets: 2,
          reps: '6',
          baseWeight: 0,
          muscleGroup: 'Chest',
          notes: '',
          position: 0,
        },
      ],
    };
    let session: WorkoutSessionLog = buildWorkoutSessionLog({
      workout,
      currentWeek: 1,
      settingsRestSeconds: 150,
      getAdjustedWeight: () => 60,
    });

    session = updateWorkoutLogSet(session, {
      exerciseId: 'bench',
      setNumber: 1,
      actualReps: 6,
      actualRir: 2,
      completed: true,
      skipped: false,
    });
    session = updateWorkoutLogSet(session, {
      exerciseId: 'bench',
      setNumber: 2,
      completed: false,
      skipped: true,
    });

    const finalized = finalizeWorkoutSession(session);
    expect(finalized.exerciseLogs[0]?.sets[0]?.actualReps).toBe(6);
    expect(finalized.exerciseLogs[0]?.sets[0]?.actualRir).toBe(2);
    expect(finalized.exerciseLogs[0]?.sets[0]?.completed).toBe(true);
    expect(finalized.exerciseLogs[0]?.sets[1]?.skipped).toBe(true);
    expect(finalized.completedAt === undefined).toBe(false);
  });

  test('updates unilateral set reps without forcing a shared rep value', () => {
    const workout: WorkoutSession = {
      ...getWorkout(),
      exercises: [
        {
          id: 'split-squat',
          name: 'Split Squat',
          sets: 1,
          reps: '8-10',
          baseWeight: 0,
          muscleGroup: 'Legs',
          notes: '',
          position: 0,
        },
      ],
    };
    let session = buildWorkoutSessionLog({
      workout,
      currentWeek: 1,
      settingsRestSeconds: 150,
      getAdjustedWeight: () => 20,
    });

    session = updateWorkoutLogSet(session, {
      exerciseId: 'split-squat',
      setNumber: 1,
      actualReps: undefined,
      actualLeftReps: 9,
      actualRightReps: 8,
      completed: true,
    });

    expect(session.exerciseLogs[0]?.sets[0]?.actualReps).toBe(undefined);
    expect(session.exerciseLogs[0]?.sets[0]?.actualLeftReps).toBe(9);
    expect(session.exerciseLogs[0]?.sets[0]?.actualRightReps).toBe(8);
  });

  test('builds a compact history summary from a completed workout log', () => {
    const workout: WorkoutSession = {
      ...getWorkout(),
      exercises: [
        {
          id: 'row',
          name: 'Row',
          sets: 2,
          reps: '8-10',
          baseWeight: 0,
          muscleGroup: 'Back',
          notes: '',
          position: 0,
        },
      ],
    };
    let session = buildWorkoutSessionLog({
      workout,
      currentWeek: 1,
      settingsRestSeconds: 150,
      startedAt: '2026-06-29T08:00:00.000Z',
      getAdjustedWeight: () => 62.5,
    });

    session = updateWorkoutLogSet(session, {
      exerciseId: 'row',
      setNumber: 1,
      actualWeight: 65,
      actualReps: 10,
      completed: true,
    });
    session = updateWorkoutLogSet(session, {
      exerciseId: 'row',
      setNumber: 2,
      actualWeight: 67.5,
      actualReps: 9,
      completed: true,
    });

    const targetExercise = workout.exercises[0];
    if (!targetExercise) {
      throw new Error('Missing row exercise.');
    }

    const summary = getExerciseHistorySummary(
      finalizeWorkoutSession(session),
      targetExercise,
    );

    expect(summary?.workoutLogId).toBe(session.id);
    expect(summary?.workoutName).toBe(workout.name);
    expect(typeof summary?.performedAt).toBe('string');
    expect(summary?.loggedWeightKg).toBe(67.5);
    expect(summary?.bestReps).toBe(10);
    expect(summary?.completedSets).toBe(2);
    expect(summary?.totalSets).toBe(2);
  });

  test('keeps prescription snapshots isolated from later program edits', () => {
    const workout: WorkoutSession = {
      ...getWorkout(),
      exercises: [
        {
          id: 'row',
          name: 'Row',
          sets: 2,
          reps: '8-10',
          baseWeight: 0,
          muscleGroup: 'Back',
          notes: '',
          position: 0,
          advanced: {
            technicalNotes: ['Retract before pulling'],
            weekOverrides: [
              {
                week: 3,
                sets: 3,
                notes: 'Add one set',
              },
            ],
          },
        },
      ],
    };

    const session = buildWorkoutSessionLog({
      workout,
      currentWeek: 1,
      settingsRestSeconds: 150,
      getAdjustedWeight: () => 62.5,
    });

    const sourceExercise = workout.exercises[0];
    const snapshot = session.exerciseLogs[0]?.prescriptionSnapshot;
    if (!sourceExercise || !snapshot) {
      throw new Error('Missing exercise snapshot.');
    }

    sourceExercise.reps = '10-12';
    sourceExercise.advanced?.technicalNotes?.push('Use full ROM');
    sourceExercise.advanced?.weekOverrides?.push({
      week: 4,
      sets: 4,
      notes: 'Add another set',
    });

    expect(snapshot.reps).toBe('8-10');
    expect(snapshot.advanced?.technicalNotes).toEqual([
      'Retract before pulling',
    ]);
    expect(snapshot.advanced?.weekOverrides).toEqual([
      {
        week: 3,
        sets: 3,
        notes: 'Add one set',
      },
    ]);
  });

  test('can match linked variants by canonical exercise id', () => {
    const workout: WorkoutSession = {
      ...getWorkout(),
      exercises: [
        {
          id: 'curl-session-b',
          canonicalExerciseId: 'alternating-curl',
          name: 'Curl Alternato',
          variantLabel: 'Session B',
          sessionSpecific: true,
          sets: 1,
          reps: '10-12',
          baseWeight: 0,
          muscleGroup: 'Biceps',
          notes: '',
          position: 0,
        },
      ],
    };
    let session = buildWorkoutSessionLog({
      workout,
      currentWeek: 1,
      settingsRestSeconds: 150,
      getAdjustedWeight: () => 14,
    });

    session = updateWorkoutLogSet(session, {
      exerciseId: 'curl-session-b',
      setNumber: 1,
      actualWeight: 14,
      actualReps: 12,
      completed: true,
    });

    const summary = getExerciseHistorySummary(
      finalizeWorkoutSession(session),
      {
        id: 'curl-session-d',
        canonicalExerciseId: 'alternating-curl',
        name: 'Curl Alternato',
        variantLabel: 'Session D',
        sessionSpecific: true,
        sets: 1,
        reps: '10-12',
        baseWeight: 0,
        muscleGroup: 'Biceps',
        notes: '',
        position: 0,
      },
      true,
    );

    expect(summary?.exerciseId).toBe('curl-session-b');
    expect(summary?.variantLabel).toBe('Session B');
    expect(summary?.bestReps).toBe(12);
  });
});
