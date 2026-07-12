import { describe, expect, test } from 'bun:test';
import { parseAndMigrateBackup, parseBackupJson } from '@/backup/migration';
import {
  toPearLiftBackup,
  toPearLiftBackupCollection,
} from '@/backup/serialization';
import type { BackupProgramState, PearLiftRuntimeState } from '@/backup/types';
import type { WorkoutSessionLog } from '@/types';

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

describe('backup migration', () => {
  test('rejects invalid backup payloads early', () => {
    expectThrowMessage(() => parseBackupJson('{'), 'Invalid JSON file.');
    expectThrowMessage(
      () => parseBackupJson(JSON.stringify({ version: 2 })),
      'Unsupported backup version.',
    );
  });

  test('normalizes malformed runtime fields while preserving valid data', () => {
    const raw = JSON.stringify({
      version: 3,
      exportedAt: '2026-01-02T03:04:05.000Z',
      data: {
        workouts: [
          {
            id: 'day1',
            name: 'Push',
            description: 'Normalized',
            exercises: [
              {
                id: 'bench',
                name: 'Bench Press',
                sets: 3,
                reps: '8',
                baseWeight: 40,
                muscleGroup: 'Chest',
                notes: 'Stable',
                position: 2,
              },
              {
                id: 'row',
                name: 'Row',
                sets: 4,
                reps: '10',
                baseWeight: 30,
                muscleGroup: 'Back',
                position: 0,
              },
            ],
          },
        ],
        userWeights: {
          bench: 42.5,
          row: 32.5,
        },
        weekConfigs: [{ id: 1, name: 'Only Week', loadModifier: 1.05, rir: 1 }],
        dayConfigs: [
          { id: 'day1', name: 'Push', sessionLabel: 'A', icon: 'Activity' },
          { id: 'day1', name: 'Duplicate Push', icon: 'Repeat' },
        ],
        settings: {
          currentWeek: 99,
          currentDay: 'missing-day',
          restDuration: 'bad-number',
          themeMode: 'bogus',
          weightUnit: 'bogus',
          language: '',
        },
      },
    });

    const migrated = parseAndMigrateBackup(raw);

    expect(migrated.backup.exportedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(
      migrated.runtime.workouts[0]?.exercises.map((item) => item.id),
    ).toEqual(['row', 'bench']);
    expect(migrated.runtime.currentWeek).toBe(1);
    expect(migrated.runtime.currentDay).toBe('day1');
    expect(migrated.runtime.restDuration).toBe(150);
    expect(migrated.runtime.themeMode).toBe('system');
    expect(migrated.runtime.weightUnit).toBe('kg');
    expect(migrated.runtime.language).toBe('system');
    expect(migrated.runtime.dayConfigs).toEqual([
      { id: 'day1', name: 'Push', sessionLabel: 'A', icon: 'Activity' },
    ]);
    expect(migrated.runtime.userWeights).toEqual({
      bench: 42.5,
      row: 32.5,
    });
    expect(migrated.runtime.userExerciseSettings).toEqual({
      bench: {
        exerciseId: 'bench',
        workingWeight: 42.5,
        weightUnit: 'kg',
        weightMode: 'total',
        updatedAt: migrated.runtime.userExerciseSettings?.bench?.updatedAt,
      },
      row: {
        exerciseId: 'row',
        workingWeight: 32.5,
        weightUnit: 'kg',
        weightMode: 'total',
        updatedAt: migrated.runtime.userExerciseSettings?.row?.updatedAt,
      },
    });
    expect(typeof migrated.runtime.userExerciseSettings?.bench?.updatedAt).toBe(
      'string',
    );
    expect(typeof migrated.runtime.userExerciseSettings?.row?.updatedAt).toBe(
      'string',
    );
  });

  test('infers unilateral metadata from rep labels during backup migration', () => {
    const raw = JSON.stringify({
      version: 4,
      exportedAt: '2026-06-24T12:00:00.000Z',
      app: {
        name: 'PearLift',
        platform: 'mobile',
        backupFormat: 'pearlift.backup.v4',
      },
      data: {
        workouts: [
          {
            id: 'day1',
            name: 'Core',
            description: 'Imported',
            exercises: [
              {
                id: 'side-crunch',
                name: 'Side Crunch',
                sets: 3,
                reps: '10-12 / l',
                baseWeight: 0,
                muscleGroup: 'Core',
                notes: '',
                position: 0,
              },
            ],
          },
        ],
        userWeights: {},
        settings: {
          currentWeek: 1,
          currentDay: 'day1',
          restDuration: 150,
          themeMode: 'system',
          weightUnit: 'kg',
          language: 'system',
        },
      },
    });

    const migrated = parseAndMigrateBackup(raw);

    expect(
      migrated.runtime.workouts[0]?.exercises[0]?.advanced?.unilateral,
    ).toEqual({
      enabled: true,
      sideMode: 'per_side',
      countBothSidesAsOneSet: true,
      label: 'per side',
    });
  });

  test('preserves advanced exercise fields from v4 backups', () => {
    const raw = JSON.stringify({
      version: 4,
      exportedAt: '2026-06-24T12:00:00.000Z',
      app: {
        name: 'PearLift',
        platform: 'mobile',
        backupFormat: 'pearlift.backup.v4',
      },
      data: {
        program: {
          id: 'program-2026-06-12-intensity-block',
          name: 'Blocco Intensità',
          subtitle: 'Forza + Ipertrofia',
          goal: 'Strength and hypertrophy',
          source: {
            type: 'coach',
            label: 'Coach PDF',
            importedAt: '2026-06-12T09:00:00.000Z',
          },
          startDate: '2026-06-12',
          durationWeeks: 4,
          workoutIds: ['day1'],
          scheduleType: 'fixed_weekly',
          progressionModel: 'mixed',
        },
        workouts: [
          {
            id: 'day1',
            name: 'Push',
            description: 'Advanced',
            defaultRestSeconds: 135,
            exercises: [
              {
                id: 'press',
                canonicalExerciseId: 'multipower-press-30',
                name: 'MultiPower Press 30°',
                aliases: ['MP Press 30'],
                variantLabel: 'Session A',
                sessionSpecific: true,
                sets: 4,
                reps: '4-6',
                baseWeight: 0,
                muscleGroup: 'Chest',
                notes: 'Main strength driver',
                position: 0,
                advanced: {
                  restSeconds: 180,
                  rir: {
                    type: 'range',
                    min: 1,
                    max: 2,
                    label: '1-2',
                  },
                  intensity: {
                    type: 'percent_1rm',
                    min: 80,
                    max: 85,
                    label: '80-85% 1RM',
                  },
                  tempo: 'Eccentrica 2 sec',
                  progressionRule: {
                    type: 'load_increment_when_top_reps_at_rir',
                    label: '+5kg when all sets hit top reps with 2 RIR',
                    incrementKg: 5,
                    targetReps: 6,
                    requiredRir: 2,
                    scope: 'all_sets',
                  },
                  unilateral: {
                    enabled: true,
                    sideMode: 'per_leg',
                    countBothSidesAsOneSet: true,
                    label: 'per leg',
                  },
                  equipment: 'Smith machine',
                  primaryMuscles: ['Chest', 'Front delts'],
                  secondaryMuscles: ['Triceps'],
                  perSetTargets: [
                    {
                      setNumber: 4,
                      reps: '8',
                      rir: {
                        type: 'fixed',
                        value: 0,
                        label: '0',
                      },
                      notes: 'Failure set',
                    },
                  ],
                  weekOverrides: [
                    {
                      week: 3,
                      sets: 5,
                      restSeconds: 210,
                      notes: 'Add one top set from week 3',
                      rir: {
                        type: 'fixed',
                        value: 1,
                        label: '1',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
        userWeights: { press: 62 },
        settings: {
          currentWeek: 1,
          currentDay: 'day1',
          restDuration: 150,
          themeMode: 'system',
          weightUnit: 'kg',
          language: 'system',
        },
      },
    });

    const migrated = parseAndMigrateBackup(raw);
    const exercise = migrated.runtime.workouts[0]?.exercises[0];

    expect(migrated.backup.version).toBe(4);
    expect(migrated.runtime.program?.name).toBe('Blocco Intensità');
    expect(migrated.runtime.program?.subtitle).toBe('Forza + Ipertrofia');
    expect(migrated.runtime.program?.source).toEqual({
      type: 'coach',
      label: 'Coach PDF',
      importedAt: '2026-06-12T09:00:00.000Z',
    });
    expect(migrated.runtime.program?.startDate).toBe('2026-06-12');
    expect(migrated.runtime.program?.durationWeeks).toBe(4);
    expect(migrated.runtime.workouts[0]?.defaultRestSeconds).toBe(135);
    expect(exercise?.canonicalExerciseId).toBe('multipower-press-30');
    expect(exercise?.aliases).toEqual(['MP Press 30']);
    expect(exercise?.variantLabel).toBe('Session A');
    expect(exercise?.sessionSpecific).toBe(true);
    expect(exercise?.advanced).toEqual({
      restSeconds: 180,
      rir: {
        type: 'range',
        min: 1,
        max: 2,
        label: '1-2',
        value: undefined,
        lastSet: undefined,
      },
      intensity: {
        type: 'percent_1rm',
        min: 80,
        max: 85,
        label: '80-85% 1RM',
        value: undefined,
      },
      tempo: 'Eccentrica 2 sec',
      progressionRule: {
        type: 'load_increment_when_top_reps_at_rir',
        label: '+5kg when all sets hit top reps with 2 RIR',
        incrementKg: 5,
        targetReps: 6,
        requiredRir: 2,
        scope: 'all_sets',
      },
      unilateral: {
        enabled: true,
        sideMode: 'per_leg',
        countBothSidesAsOneSet: true,
        label: 'per leg',
      },
      equipment: 'Smith machine',
      primaryMuscles: ['Chest', 'Front delts'],
      secondaryMuscles: ['Triceps'],
      perSetTargets: [
        {
          setNumber: 4,
          reps: '8',
          rir: {
            type: 'fixed',
            value: 0,
            label: '0',
            min: undefined,
            max: undefined,
            lastSet: undefined,
          },
          notes: 'Failure set',
        },
      ],
      weekOverrides: [
        {
          week: 3,
          sets: 5,
          restSeconds: 210,
          notes: 'Add one top set from week 3',
          rir: {
            type: 'fixed',
            value: 1,
            label: '1',
            min: undefined,
            max: undefined,
            lastSet: undefined,
          },
        },
      ],
    });
  });

  test('preserves session logs from v4 backups', () => {
    const raw = JSON.stringify({
      version: 4,
      exportedAt: '2026-06-24T12:00:00.000Z',
      app: {
        name: 'PearLift',
        platform: 'mobile',
        backupFormat: 'pearlift.backup.v4',
      },
      data: {
        workouts: [
          {
            id: 'day1',
            name: 'Push',
            description: 'Advanced',
            exercises: [],
          },
        ],
        userWeights: {},
        sessionLogs: [
          {
            id: 'log-1',
            workoutId: 'day1',
            workoutNameSnapshot: 'Push',
            startedAt: '2026-06-24T10:00:00.000Z',
            completedAt: '2026-06-24T10:30:00.000Z',
            exerciseLogs: [
              {
                exerciseId: 'press',
                exerciseNameSnapshot: 'Bench Press',
                sets: [
                  {
                    setNumber: 1,
                    targetRepsLabel: '6',
                    plannedWeight: 60,
                    actualReps: 6,
                    actualRir: 2,
                    completed: true,
                  },
                ],
              },
            ],
          },
        ],
        settings: {
          currentWeek: 1,
          currentDay: 'day1',
          restDuration: 150,
          themeMode: 'system',
          weightUnit: 'kg',
          language: 'system',
        },
      },
    });

    const migrated = parseAndMigrateBackup(raw);

    expect(migrated.sessionLogs).toEqual([
      {
        id: 'log-1',
        workoutId: 'day1',
        workoutNameSnapshot: 'Push',
        startedAt: '2026-06-24T10:00:00.000Z',
        completedAt: '2026-06-24T10:30:00.000Z',
        exerciseLogs: [
          {
            exerciseId: 'press',
            exerciseNameSnapshot: 'Bench Press',
            sets: [
              {
                setNumber: 1,
                targetRepsLabel: '6',
                plannedWeight: 60,
                actualReps: 6,
                actualRir: 2,
                completed: true,
              },
            ],
          },
        ],
      },
    ]);
    expect(migrated.backup.data.sessionLogs).toEqual(migrated.sessionLogs);
  });

  test('exports current backups as version 4', () => {
    const runtime: PearLiftRuntimeState = {
      program: {
        id: 'program-2026-06-12-intensity-block',
        name: 'Blocco Intensità',
        subtitle: 'Forza + Ipertrofia',
        goal: 'Strength and hypertrophy',
        source: {
          type: 'template',
          label: 'Intensity block',
        },
        startDate: '2026-06-12',
        durationWeeks: 4,
        workoutIds: ['day1'],
        scheduleType: 'fixed_weekly',
        progressionModel: 'mixed',
      },
      workouts: [
        {
          id: 'day1',
          name: 'Push',
          description: 'Advanced',
          defaultRestSeconds: 135,
          exercises: [
            {
              id: 'press',
              canonicalExerciseId: 'multipower-press-30',
              name: 'MultiPower Press 30°',
              aliases: ['MP Press 30'],
              variantLabel: 'Session A',
              sessionSpecific: true,
              sets: 4,
              reps: '4-6',
              baseWeight: 62,
              muscleGroup: 'Chest',
              notes: '',
              position: 0,
              advanced: {
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
                    sets: 5,
                  },
                ],
              },
            },
          ],
        },
      ],
      userWeights: { press: 62 },
      userExerciseSettings: {
        press: {
          exerciseId: 'press',
          workingWeight: 62,
          weightUnit: 'kg',
          weightMode: 'machine_stack',
          incrementKg: 5,
          estimatedOneRepMax: 80,
          updatedAt: '2026-06-24T12:00:00.000Z',
        },
      },
      weekConfigs: [],
      dayConfigs: [
        { id: 'day1', name: 'Push', sessionLabel: 'A', icon: 'Activity' },
      ],
      currentWeek: 4,
      currentDay: 'day1',
      restDuration: 150,
      themeMode: 'system',
      weightUnit: 'kg',
      language: 'system',
    };

    const sessionLogs: WorkoutSessionLog[] = [
      {
        id: 'log-1',
        workoutId: 'day1',
        workoutNameSnapshot: 'Push',
        startedAt: '2026-06-24T10:00:00.000Z',
        completedAt: '2026-06-24T10:30:00.000Z',
        exerciseLogs: [],
      },
    ];

    const backup = toPearLiftBackup(runtime, sessionLogs);

    expect(backup.version).toBe(4);
    expect(backup.app.backupFormat).toBe('pearlift.backup.v4');
    expect(backup.data.program?.name).toBe('Blocco Intensità');
    expect(backup.data.program?.source).toEqual({
      type: 'template',
      label: 'Intensity block',
    });
    expect(backup.data.program?.startDate).toBe('2026-06-12');
    expect(backup.data.program?.durationWeeks).toBe(4);
    expect(backup.data.activeProgramId).toBe(
      'program-2026-06-12-intensity-block',
    );
    expect(backup.data.programs).toEqual([runtime.program]);
    expect(backup.data.workouts[0]?.programId).toBe(
      'program-2026-06-12-intensity-block',
    );
    expect(backup.data.workouts[0]?.defaultRestSeconds).toBe(135);
    expect(backup.data.workouts[0]?.exercises[0]?.advanced?.restSeconds).toBe(
      180,
    );
    expect(backup.data.workouts[0]?.exercises[0]?.canonicalExerciseId).toBe(
      'multipower-press-30',
    );
    expect(backup.data.workouts[0]?.exercises[0]?.aliases).toEqual([
      'MP Press 30',
    ]);
    expect(backup.data.workouts[0]?.exercises[0]?.variantLabel).toBe(
      'Session A',
    );
    expect(backup.data.workouts[0]?.exercises[0]?.sessionSpecific).toBe(true);
    expect(backup.data.dayConfigs?.[0]?.sessionLabel).toBe('A');
    expect(
      backup.data.workouts[0]?.exercises[0]?.advanced?.weekOverrides,
    ).toEqual([
      {
        week: 3,
        sets: 5,
      },
    ]);
    expect(backup.data.userExerciseSettings?.press).toEqual({
      exerciseId: 'press',
      workingWeight: 62,
      weightUnit: 'kg',
      weightMode: 'machine_stack',
      incrementKg: 5,
      estimatedOneRepMax: 80,
      updatedAt: '2026-06-24T12:00:00.000Z',
    });
    expect(backup.data.sessionLogs).toEqual(sessionLogs);

    const migrated = parseAndMigrateBackup(JSON.stringify(backup));

    expect(migrated.runtime.weekConfigs).toEqual([]);
    expect(migrated.runtime.currentWeek).toBe(4);
  });

  test('round-trips multi-program backups while keeping the active program', () => {
    const activeProgram: BackupProgramState = {
      program: {
        id: 'intensity-block',
        name: 'Blocco Intensita',
        subtitle: 'Forza + Ipertrofia',
        workoutIds: ['intensity-day-1'],
      },
      workouts: [
        {
          id: 'intensity-day-1',
          name: 'Push',
          description: 'Heavy push day',
          exercises: [
            {
              id: 'intensity-press',
              name: 'Bench Press',
              sets: 4,
              reps: '4-6',
              baseWeight: 82.5,
              muscleGroup: 'Chest',
              notes: '',
              position: 0,
            },
          ],
        },
      ],
      userWeights: {
        'intensity-press': 85,
      },
      userExerciseSettings: {
        'intensity-press': {
          exerciseId: 'intensity-press',
          workingWeight: 85,
          weightUnit: 'kg',
          weightMode: 'total',
          updatedAt: '2026-07-09T10:00:00.000Z',
        },
      },
      weekConfigs: [{ id: 1, name: 'Week 1', loadModifier: 1, rir: 2 }],
      dayConfigs: [
        {
          id: 'intensity-day-1',
          name: 'Push',
          sessionLabel: 'A',
          icon: 'Activity',
        },
      ],
      currentWeek: 1,
      currentDay: 'intensity-day-1',
      restDuration: 150,
      themeMode: 'system',
      weightUnit: 'kg',
      language: 'system',
      sessionLogs: [
        {
          id: 'log-active',
          programId: 'intensity-block',
          workoutId: 'intensity-day-1',
          workoutNameSnapshot: 'Push',
          startedAt: '2026-07-09T10:00:00.000Z',
          exerciseLogs: [],
        },
      ],
    };
    const archivedProgram: BackupProgramState = {
      program: {
        id: 'archived-block',
        name: 'Archived Block',
        workoutIds: ['archived-day-1'],
      },
      workouts: [
        {
          id: 'archived-day-1',
          name: 'Pull',
          description: 'Pull day',
          exercises: [
            {
              id: 'archived-row',
              name: 'Chest Supported Row',
              sets: 3,
              reps: '8-10',
              baseWeight: 55,
              muscleGroup: 'Back',
              notes: '',
              position: 0,
            },
          ],
        },
      ],
      userWeights: {
        'archived-row': 57.5,
      },
      userExerciseSettings: {},
      weekConfigs: [{ id: 1, name: 'Week 1', loadModifier: 1, rir: 1 }],
      dayConfigs: [
        {
          id: 'archived-day-1',
          name: 'Pull',
          sessionLabel: 'B',
          icon: 'Activity',
        },
      ],
      currentWeek: 1,
      currentDay: 'archived-day-1',
      restDuration: 150,
      themeMode: 'system',
      weightUnit: 'kg',
      language: 'system',
      sessionLogs: [
        {
          id: 'log-archived',
          programId: 'archived-block',
          workoutId: 'archived-day-1',
          workoutNameSnapshot: 'Pull',
          startedAt: '2026-07-08T10:00:00.000Z',
          exerciseLogs: [],
        },
      ],
    };

    const backup = toPearLiftBackupCollection({
      programs: [activeProgram, archivedProgram],
      activeProgramId: 'intensity-block',
    });
    const migrated = parseAndMigrateBackup(JSON.stringify(backup));

    expect(migrated.backup.data.activeProgramId).toBe('intensity-block');
    expect(migrated.backup.data.programs?.map((program) => program.id)).toEqual(
      ['intensity-block', 'archived-block'],
    );
    expect(migrated.collection.programs.length).toBe(2);
    expect(migrated.collection.activeProgramId).toBe('intensity-block');
    expect(migrated.runtime.program?.id).toBe('intensity-block');
    expect(migrated.runtime.workouts[0]?.id).toBe('intensity-day-1');
    expect(migrated.collection.programs[1]?.program.id).toBe('archived-block');
    expect(migrated.collection.programs[1]?.workouts[0]?.id).toBe(
      'archived-day-1',
    );
    expect(migrated.collection.programs[1]?.sessionLogs[0]?.programId).toBe(
      'archived-block',
    );
  });

  test('keeps per-set RIR targets in version 4 backups', () => {
    const raw = JSON.stringify({
      version: 4,
      exportedAt: '2026-06-24T00:00:00.000Z',
      app: {
        name: 'PearLift',
        platform: 'mobile',
        backupFormat: 'pearlift.backup.v4',
      },
      data: {
        workouts: [
          {
            id: 'day1',
            name: 'Push',
            description: 'Advanced',
            exercises: [
              {
                id: 'press',
                name: 'Bench Press',
                sets: 3,
                reps: '6',
                baseWeight: 60,
                muscleGroup: 'Chest',
                notes: '',
                position: 0,
                advanced: {
                  rir: {
                    type: 'per_set',
                    values: [2, 1, 0],
                    label: '2 / 1 / 0',
                  },
                  perSetTargets: [
                    {
                      setNumber: 3,
                      reps: '10',
                      rir: {
                        type: 'fixed',
                        value: 0,
                        label: '0',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
        userWeights: { press: 60 },
        settings: {
          currentWeek: 1,
          currentDay: 'day1',
          restDuration: 150,
          themeMode: 'system',
          weightUnit: 'kg',
          language: 'system',
        },
      },
    });

    const migrated = parseAndMigrateBackup(raw);

    expect(migrated.runtime.workouts[0]?.exercises[0]?.advanced?.rir).toEqual({
      type: 'per_set',
      values: [2, 1, 0],
      label: '2 / 1 / 0',
      value: undefined,
      min: undefined,
      max: undefined,
      lastSet: undefined,
    });
    expect(
      migrated.runtime.workouts[0]?.exercises[0]?.advanced?.perSetTargets,
    ).toEqual([
      {
        setNumber: 3,
        reps: '10',
        rir: {
          type: 'fixed',
          value: 0,
          label: '0',
          min: undefined,
          max: undefined,
          lastSet: undefined,
        },
      },
    ]);
  });
});
