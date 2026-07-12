import { describe, expect, test } from 'bun:test';
import type { PearLiftRuntimeState } from '@/backup/types';
import { buildDefaultRuntimeState } from '@/storage/repository/defaults';
import {
  buildImportedProgramId,
  remapImportedProgram,
} from '@/utils/programImport';

function cloneRuntime(state: PearLiftRuntimeState): PearLiftRuntimeState {
  return JSON.parse(JSON.stringify(state)) as PearLiftRuntimeState;
}

describe('program import helpers', () => {
  test('builds deterministic imported program ids', () => {
    const existingIds = new Set([
      'main-program',
      'main-program-copy',
      'main-program-copy-2',
    ]);

    expect(buildImportedProgramId('main-program', existingIds)).toBe(
      'main-program-copy-3',
    );
    expect(buildImportedProgramId('imported-plan', existingIds)).toBe(
      'imported-plan',
    );
  });

  test('remaps program, workout, exercise, and log ids for side-by-side import', () => {
    const runtime = cloneRuntime(buildDefaultRuntimeState());
    runtime.program = {
      ...runtime.program,
      id: 'intensity-block',
      name: 'Blocco Intensita',
      workoutIds: runtime.workouts.map((workout) => workout.id),
    };
    runtime.currentDay = runtime.workouts[0]?.id ?? 'push';

    const firstWorkout = runtime.workouts[0];
    const firstExercise = firstWorkout?.exercises[0];
    if (!firstWorkout || !firstExercise) {
      throw new Error('Expected seeded workout and exercise');
    }

    runtime.userWeights[firstExercise.id] = 62.5;
    runtime.userExerciseSettings = {
      [firstExercise.id]: {
        exerciseId: firstExercise.id,
        workingWeight: 62.5,
        weightUnit: 'kg',
        weightMode: 'total',
        updatedAt: '2026-07-09T12:00:00.000Z',
      },
    };

    const sessionLogs = [
      {
        id: 'log-1',
        programId: runtime.program?.id,
        workoutId: firstWorkout.id,
        workoutNameSnapshot: firstWorkout.name,
        startedAt: '2026-07-09T12:00:00.000Z',
        exerciseLogs: [
          {
            exerciseId: firstExercise.id,
            exerciseNameSnapshot: firstExercise.name,
            prescriptionSnapshot: firstExercise,
            sets: [],
          },
        ],
      },
    ];

    const imported = remapImportedProgram({
      runtime,
      sessionLogs,
      programId: 'intensity-block-copy',
      prefixChildIds: true,
    });

    const remappedWorkout = imported.runtime.workouts[0];
    const remappedExercise = remappedWorkout?.exercises[0];
    if (!remappedWorkout || !remappedExercise) {
      throw new Error('Expected remapped workout and exercise');
    }

    expect(imported.runtime.program?.id).toBe('intensity-block-copy');
    expect(imported.runtime.program?.workoutIds).toEqual([
      'intensity-block-copy__day1',
      'intensity-block-copy__day2',
      'intensity-block-copy__day3',
      'intensity-block-copy__day4',
    ]);
    expect(remappedWorkout.id).toBe('intensity-block-copy__day1');
    expect(remappedExercise.id).toBe(
      `intensity-block-copy__${firstExercise.id}`,
    );
    expect(imported.runtime.currentDay).toBe('intensity-block-copy__day1');
    expect(
      imported.runtime.userWeights[`intensity-block-copy__${firstExercise.id}`],
    ).toBe(62.5);
    expect(
      imported.runtime.userExerciseSettings?.[
        `intensity-block-copy__${firstExercise.id}`
      ]?.exerciseId,
    ).toBe(`intensity-block-copy__${firstExercise.id}`);
    expect(imported.sessionLogs[0]?.programId).toBe('intensity-block-copy');
    expect(imported.sessionLogs[0]?.id).toBe('intensity-block-copy__log-1');
    expect(imported.sessionLogs[0]?.workoutId).toBe(
      'intensity-block-copy__day1',
    );
    expect(imported.sessionLogs[0]?.exerciseLogs[0]?.exerciseId).toBe(
      `intensity-block-copy__${firstExercise.id}`,
    );
    expect(
      imported.sessionLogs[0]?.exerciseLogs[0]?.prescriptionSnapshot?.id,
    ).toBe(`intensity-block-copy__${firstExercise.id}`);
  });
});
