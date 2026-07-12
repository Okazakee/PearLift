import { describe, expect, test } from 'bun:test';
import { parseAndMigrateBackup } from '@/backup/migration';
import {
  assembleChunkedPackets,
  decodeQrPayload,
  encodeBackupForQr,
} from '@/backup/qrBackupCodec';
import type {
  BackupProgramCollection,
  PearLiftRuntimeState,
} from '@/backup/types';
import { buildDefaultRuntimeState } from '@/storage/repository/defaults';
import type { ExerciseAdvanced } from '@/types';

function buildSmallRuntime(): PearLiftRuntimeState {
  return {
    program: {
      id: 'program-1',
      name: 'Blocco Intensità',
      subtitle: 'Forza + Ipertrofia',
      workoutIds: ['day1'],
      scheduleType: 'fixed_weekly',
    },
    workouts: [
      {
        id: 'day1',
        name: 'Day 1',
        description: 'Minimal',
        defaultRestSeconds: 135,
        exercises: [
          {
            id: 'exercise-1',
            canonicalExerciseId: 'bench-press',
            name: 'Bench Press',
            aliases: ['Barbell Bench'],
            variantLabel: 'Session A',
            sessionSpecific: true,
            sets: 3,
            reps: '8',
            baseWeight: 20,
            muscleGroup: 'Chest',
            notes: '',
            position: 0,
            advanced: {
              restSeconds: 180,
              rir: {
                type: 'range' as const,
                min: 1,
                max: 2,
                label: '1-2',
              },
              weekOverrides: [
                {
                  week: 3,
                  sets: 4,
                  restSeconds: 210,
                },
              ],
            },
          },
        ],
      },
    ],
    userWeights: { 'exercise-1': 20 },
    userExerciseSettings: {
      'exercise-1': {
        exerciseId: 'exercise-1',
        workingWeight: 20,
        weightUnit: 'kg',
        weightMode: 'per_hand',
        incrementKg: 2.5,
        estimatedOneRepMax: 90,
        updatedAt: '2026-06-24T12:00:00.000Z',
      },
    },
    weekConfigs: [
      {
        id: 1,
        name: 'Week 1',
        loadModifier: 1,
        volumeModifier: 0.95,
        rir: 2,
        notes: 'Trim accessories this week',
      },
    ],
    dayConfigs: [
      { id: 'day1', name: 'Day 1', sessionLabel: 'A', icon: 'Activity' },
    ],
    currentWeek: 1,
    currentDay: 'day1',
    restDuration: 150,
    themeMode: 'system',
    weightUnit: 'kg',
    language: 'system',
  };
}

function buildLargeRuntime(): PearLiftRuntimeState {
  const state = buildDefaultRuntimeState();
  const program = state.program;
  if (!program) {
    throw new Error('Missing default program.');
  }
  const advancedSeed = {
    restSeconds: 180,
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
        restSeconds: 210,
      },
    ],
  } satisfies ExerciseAdvanced;
  const workouts: PearLiftRuntimeState['workouts'] = state.workouts.map(
    (workout, workoutIndex) => ({
      ...workout,
      ...(workoutIndex === 0 ? { defaultRestSeconds: 135 } : {}),
      exercises: workout.exercises.map((exercise, exerciseIndex) => ({
        ...exercise,
        notes: `Chunk payload ${workout.id}-${exerciseIndex} `.repeat(400),
        name: `${exercise.name} ${String(workoutIndex + 1).repeat(60)}`,
        advanced:
          workoutIndex === 0 && exerciseIndex === 0
            ? advancedSeed
            : exercise.advanced,
      })),
    }),
  );

  return {
    ...state,
    program: {
      ...program,
      name: 'Blocco Intensità',
      subtitle: 'Forza + Ipertrofia',
    },
    workouts,
  };
}

function buildProgramCollection(): BackupProgramCollection {
  const activeRuntime = buildLargeRuntime();
  const activeProgram = activeRuntime.program;
  if (!activeProgram) {
    throw new Error('Missing active program.');
  }

  return {
    activeProgramId: activeProgram.id,
    programs: [
      {
        ...activeRuntime,
        program: activeProgram,
        sessionLogs: [
          {
            id: 'log-active',
            programId: activeProgram.id,
            workoutId: activeRuntime.workouts[0]?.id ?? 'day1',
            workoutNameSnapshot: activeRuntime.workouts[0]?.name ?? 'Day 1',
            startedAt: '2026-07-08T09:00:00.000Z',
            exerciseLogs: [],
          },
        ],
      },
      {
        ...buildSmallRuntime(),
        program: {
          id: 'archived-block',
          name: 'Archived Block',
          subtitle: 'Older cycle',
          workoutIds: ['day1'],
          scheduleType: 'fixed_weekly',
        },
        sessionLogs: [
          {
            id: 'log-archived',
            programId: 'archived-block',
            workoutId: 'day1',
            workoutNameSnapshot: 'Day 1',
            startedAt: '2026-07-07T09:00:00.000Z',
            exerciseLogs: [],
          },
        ],
      },
    ],
  };
}

function expectThrowMessage(fn: () => void, message: string) {
  let caught: unknown = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }

  expect(caught instanceof Error ? caught.message : String(caught)).toBe(
    message,
  );
}

describe('QR backup codec', () => {
  test('keeps small payloads in a single QR envelope', () => {
    const runtime = buildSmallRuntime();
    const encoded = encodeBackupForQr(runtime);

    expect(encoded.mode).toBe('single');
    expect(encoded.packets.length).toBe(1);

    const decoded = decodeQrPayload(encoded.packets[0] ?? '');
    expect(decoded.kind).toBe('single');
    if (decoded.kind === 'single') {
      expect(decoded.checksum).toBe(encoded.checksum);
      const migrated = parseAndMigrateBackup(
        assembleChunkedPackets(
          new Map([[0, decoded.payload]]),
          1,
          decoded.checksum,
        ),
      );
      expect(migrated.runtime.userExerciseSettings).toEqual(
        runtime.userExerciseSettings,
      );
    }
  });

  test('round-trips large payloads through chunk assembly', () => {
    const runtime = buildLargeRuntime();
    const encoded = encodeBackupForQr(runtime);

    expect(encoded.mode).toBe('chunked');
    expect(encoded.packets.length).toBeGreaterThan(1);

    const packets = new Map<number, string>();
    for (const packet of encoded.packets) {
      const decoded = decodeQrPayload(packet);
      expect(decoded.kind).toBe('chunk');
      if (decoded.kind === 'chunk') {
        packets.set(decoded.index, decoded.payload);
      }
    }

    const jsonText = assembleChunkedPackets(
      packets,
      encoded.packets.length,
      encoded.checksum,
    );
    const migrated = parseAndMigrateBackup(jsonText);

    expect(migrated.runtime.workouts.length).toBe(runtime.workouts.length);
    expect(migrated.runtime.program?.subtitle).toBe('Forza + Ipertrofia');
    expect(
      migrated.runtime.workouts[0]?.exercises[0]?.notes.includes(
        'Chunk payload',
      ),
    ).toBe(true);
    expect(
      migrated.runtime.workouts[0]?.exercises[0]?.advanced?.restSeconds,
    ).toBe(runtime.workouts[0]?.exercises[0]?.advanced?.restSeconds);
    expect(
      migrated.runtime.workouts[0]?.exercises[0]?.canonicalExerciseId,
    ).toBe(runtime.workouts[0]?.exercises[0]?.canonicalExerciseId);
    expect(migrated.runtime.workouts[0]?.exercises[0]?.aliases).toEqual(
      runtime.workouts[0]?.exercises[0]?.aliases,
    );
    expect(migrated.runtime.workouts[0]?.exercises[0]?.variantLabel).toBe(
      runtime.workouts[0]?.exercises[0]?.variantLabel,
    );
    expect(migrated.runtime.workouts[0]?.exercises[0]?.sessionSpecific).toBe(
      runtime.workouts[0]?.exercises[0]?.sessionSpecific,
    );
    expect(migrated.runtime.dayConfigs[0]?.sessionLabel).toBe(
      runtime.dayConfigs[0]?.sessionLabel,
    );
    expect(
      migrated.runtime.workouts[0]?.exercises[0]?.advanced?.weekOverrides,
    ).toEqual(runtime.workouts[0]?.exercises[0]?.advanced?.weekOverrides);
    expect(migrated.runtime.workouts[0]?.defaultRestSeconds).toBe(
      runtime.workouts[0]?.defaultRestSeconds,
    );
    expect(migrated.runtime.weekConfigs[0]?.volumeModifier).toBe(
      runtime.weekConfigs[0]?.volumeModifier,
    );
    expect(migrated.runtime.weekConfigs[0]?.notes).toBe(
      runtime.weekConfigs[0]?.notes,
    );
    expect(migrated.runtime.language).toBe(runtime.language);
  });

  test('round-trips full program collections through QR transfer', () => {
    const collection = buildProgramCollection();
    const encoded = encodeBackupForQr(collection);

    expect(encoded.packets.length).toBeGreaterThan(0);

    const packets = new Map<number, string>();
    if (encoded.mode === 'single') {
      const decoded = decodeQrPayload(encoded.packets[0] ?? '');
      expect(decoded.kind).toBe('single');
      if (decoded.kind === 'single') {
        packets.set(0, decoded.payload);
      }
    } else {
      for (const packet of encoded.packets) {
        const decoded = decodeQrPayload(packet);
        expect(decoded.kind).toBe('chunk');
        if (decoded.kind === 'chunk') {
          packets.set(decoded.index, decoded.payload);
        }
      }
    }

    const jsonText = assembleChunkedPackets(
      packets,
      encoded.packets.length,
      encoded.checksum,
    );
    const migrated = parseAndMigrateBackup(jsonText);

    expect(migrated.collection.activeProgramId).toBe(
      collection.activeProgramId,
    );
    expect(
      migrated.collection.programs.map((program) => program.program.id),
    ).toEqual(collection.programs.map((program) => program.program.id));
    expect(migrated.collection.programs[1]?.program.name).toBe(
      'Archived Block',
    );
    expect(migrated.collection.programs[0]?.workouts.length).toBe(
      collection.programs[0]?.workouts.length,
    );
    expect(migrated.collection.programs[1]?.workouts[0]?.name).toBe('Day 1');
    expect(migrated.collection.programs[0]?.sessionLogs).toEqual([]);
    expect(migrated.collection.programs[1]?.sessionLogs).toEqual([]);
  });

  test('returns raw payloads and rejects incomplete chunk maps', () => {
    expect(decodeQrPayload('plain-text-backup')).toEqual({
      kind: 'raw',
      payload: 'plain-text-backup',
    });

    expectThrowMessage(
      () => assembleChunkedPackets(new Map([[0, 'abc']]), 2, 'deadbeef'),
      'Missing QR chunks.',
    );
  });
});
