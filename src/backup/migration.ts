import {
  alignWorkoutsToDays,
  buildDefaultUserExerciseSettings,
  clampWeek,
  cloneDefaultWorkouts,
  isRecord,
  normalizeCurrentDay,
  normalizeDayConfigs,
  normalizeTrainingProgram,
  normalizeUserExerciseSettings,
  normalizeWeekConfigs,
  normalizeWeights,
  normalizeWorkout,
  reconcileDayConfigs,
} from '@/backup/normalization';
import { toPearLiftBackupCollection } from '@/backup/serialization';
import {
  type BackupProgramCollection,
  type BackupProgramState,
  CURRENT_BACKUP_VERSION,
  type MigratedBackupResult,
  type PearLiftBackupAny,
  type PearLiftBackupWorkout,
  type PearLiftRuntimeState,
} from '@/backup/types';
import type { ThemePreference } from '@/theme/tokens';
import type {
  DayConfig,
  TrainingProgram,
  WeekConfig,
  WeightUnit,
  WorkoutSession,
  WorkoutSessionLog,
} from '@/types';

function normalizeWorkoutSessionLogs(value: unknown): WorkoutSessionLog[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is WorkoutSessionLog => {
    if (!isRecord(item)) {
      return false;
    }

    return (
      typeof item.id === 'string' &&
      item.id.trim().length > 0 &&
      typeof item.workoutId === 'string' &&
      item.workoutId.trim().length > 0 &&
      typeof item.workoutNameSnapshot === 'string' &&
      item.workoutNameSnapshot.trim().length > 0 &&
      typeof item.startedAt === 'string' &&
      item.startedAt.trim().length > 0 &&
      Array.isArray(item.exerciseLogs)
    );
  });
}

function normalizeBackupWorkouts(
  value: unknown,
  fallbackProgramId: string,
): Array<WorkoutSession & { programId: string }> {
  const rawWorkouts = Array.isArray(value)
    ? value.filter(isRecord)
    : cloneDefaultWorkouts();

  return rawWorkouts
    .map((workout) => {
      const normalized = normalizeWorkout(workout as PearLiftBackupWorkout);
      const rawProgramId =
        'programId' in workout ? workout.programId : undefined;
      return {
        ...normalized,
        programId:
          typeof rawProgramId === 'string' && rawProgramId.trim().length > 0
            ? rawProgramId.trim()
            : fallbackProgramId,
      };
    })
    .map((workout) => ({
      ...workout,
      exercises: workout.exercises
        .sort((a, b) => a.position - b.position)
        .map((exercise, index) => ({ ...exercise, position: index })),
    }));
}

function normalizeBackupWeekConfigs(
  value: unknown,
  fallbackProgramId: string,
): Array<WeekConfig & { programId: string }> {
  if (!Array.isArray(value)) {
    return normalizeWeekConfigs(value).map((week) => ({
      ...week,
      programId: fallbackProgramId,
    }));
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const normalized = normalizeWeekConfigs([entry]);
    if (normalized.length === 0) {
      return [];
    }

    return normalized.map((week) => ({
      ...week,
      programId:
        typeof entry.programId === 'string' && entry.programId.trim().length > 0
          ? entry.programId.trim()
          : fallbackProgramId,
    }));
  });
}

function normalizeBackupDayConfigs(
  value: unknown,
  fallbackProgramId: string,
): Array<DayConfig & { programId: string }> {
  if (!Array.isArray(value)) {
    return normalizeDayConfigs(value).map((day) => ({
      ...day,
      programId: fallbackProgramId,
    }));
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const normalized = normalizeDayConfigs([entry]);
    if (normalized.length === 0) {
      return [];
    }

    return normalized.map((day) => ({
      ...day,
      programId:
        typeof entry.programId === 'string' && entry.programId.trim().length > 0
          ? entry.programId.trim()
          : fallbackProgramId,
    }));
  });
}

function filterWeightsForWorkouts(
  weights: PearLiftRuntimeState['userWeights'],
  workouts: WorkoutSession[],
) {
  const exerciseIds = new Set(
    workouts.flatMap((workout) =>
      workout.exercises.map((exercise) => exercise.id),
    ),
  );
  return Object.fromEntries(
    Object.entries(weights).filter(([exerciseId]) =>
      exerciseIds.has(exerciseId),
    ),
  );
}

function filterUserExerciseSettingsForWorkouts(
  settings: PearLiftRuntimeState['userExerciseSettings'],
  workouts: WorkoutSession[],
) {
  const exerciseIds = new Set(
    workouts.flatMap((workout) =>
      workout.exercises.map((exercise) => exercise.id),
    ),
  );
  return Object.fromEntries(
    Object.entries(settings ?? {}).filter(([exerciseId]) =>
      exerciseIds.has(exerciseId),
    ),
  );
}

function filterSessionLogsForProgram(
  sessionLogs: WorkoutSessionLog[],
  input: { programId: string; workoutIds: Set<string> },
) {
  return sessionLogs.filter(
    (log) =>
      log.programId === input.programId || input.workoutIds.has(log.workoutId),
  );
}

function normalizeProgramDefinitions(
  data: Record<string, unknown>,
  workouts: Array<WorkoutSession & { programId: string }>,
): { programs: TrainingProgram[]; activeProgramId: string } {
  const rawPrograms = Array.isArray(data.programs)
    ? data.programs.filter(isRecord)
    : [];
  const fallbackProgramId =
    typeof data.activeProgramId === 'string' &&
    data.activeProgramId.trim().length > 0
      ? data.activeProgramId.trim()
      : typeof data.program === 'object' &&
          data.program !== null &&
          !Array.isArray(data.program) &&
          'id' in data.program &&
          typeof data.program.id === 'string' &&
          data.program.id.trim().length > 0
        ? data.program.id.trim()
        : 'main-program';
  const fallbackProgramWorkouts = workouts
    .filter((workout) => workout.programId === fallbackProgramId)
    .map((workout) => ({
      ...workout,
      exercises: workout.exercises,
    }));

  const programs =
    rawPrograms.length > 0
      ? rawPrograms
          .map((program) => {
            const programId =
              'id' in program &&
              typeof program.id === 'string' &&
              program.id.trim().length > 0
                ? program.id.trim()
                : fallbackProgramId;
            const programWorkouts = workouts
              .filter((workout) => workout.programId === programId)
              .map((workout) => ({
                ...workout,
                exercises: workout.exercises,
              }));
            return normalizeTrainingProgram(program, programWorkouts);
          })
          .filter((program): program is TrainingProgram => program !== null)
      : [
          normalizeTrainingProgram(
            data.program,
            fallbackProgramWorkouts.length > 0
              ? fallbackProgramWorkouts
              : cloneDefaultWorkouts(),
          ),
        ].filter((program): program is TrainingProgram => program !== null);
  const normalizedPrograms =
    programs.length > 0
      ? programs
      : [
          {
            id: fallbackProgramId,
            name: 'Main Program',
            workoutIds:
              fallbackProgramWorkouts.length > 0
                ? fallbackProgramWorkouts.map((workout) => workout.id)
                : cloneDefaultWorkouts().map((workout) => workout.id),
          },
        ];

  const activeProgramId =
    typeof data.activeProgramId === 'string' &&
    data.activeProgramId.trim().length > 0
      ? data.activeProgramId.trim()
      : (normalizedPrograms[0]?.id ?? fallbackProgramId);

  return { programs: normalizedPrograms, activeProgramId };
}

export function parseBackupJson(raw: string): PearLiftBackupAny {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON file.');
  }

  if (!isRecord(parsed)) {
    throw new Error('Backup root must be an object.');
  }

  if (!('version' in parsed) || typeof parsed.version !== 'number') {
    throw new Error('Missing backup version.');
  }
  if (parsed.version !== 3 && parsed.version !== CURRENT_BACKUP_VERSION) {
    throw new Error('Unsupported backup version.');
  }

  if (!('data' in parsed) || !isRecord(parsed.data)) {
    throw new Error('Backup data field is missing or invalid.');
  }

  return parsed;
}

export function migrateToCurrentState(
  parsed: PearLiftBackupAny,
): MigratedBackupResult {
  const exportedAt =
    typeof parsed.exportedAt === 'string'
      ? parsed.exportedAt
      : new Date().toISOString();
  const data = isRecord(parsed.data) ? parsed.data : {};
  const settings = isRecord(data.settings) ? data.settings : {};
  const requestedActiveProgramId =
    typeof data.activeProgramId === 'string' &&
    data.activeProgramId.trim().length > 0
      ? data.activeProgramId.trim()
      : typeof data.program === 'object' &&
          data.program !== null &&
          !Array.isArray(data.program) &&
          'id' in data.program &&
          typeof data.program.id === 'string' &&
          data.program.id.trim().length > 0
        ? data.program.id.trim()
        : 'main-program';
  const normalizedWorkouts = normalizeBackupWorkouts(
    data.workouts,
    requestedActiveProgramId,
  );
  const { programs: normalizedPrograms, activeProgramId } =
    normalizeProgramDefinitions(data, normalizedWorkouts);
  const normalizedWeekConfigs = normalizeBackupWeekConfigs(
    data.weekConfigs,
    activeProgramId,
  );
  const normalizedDayConfigs = normalizeBackupDayConfigs(
    data.dayConfigs,
    activeProgramId,
  );

  const requestedWeek = Number(settings.currentWeek ?? 1);
  const restDuration = Number.isFinite(Number(settings.restDuration))
    ? Number(settings.restDuration)
    : 150;
  const requestedTheme = settings.themeMode;
  const themeMode: ThemePreference =
    requestedTheme === 'system' ||
    requestedTheme === 'light' ||
    requestedTheme === 'dark'
      ? requestedTheme
      : 'system';
  const weightUnit: WeightUnit = settings.weightUnit === 'lb' ? 'lb' : 'kg';
  const language =
    typeof settings.language === 'string' && settings.language.trim().length > 0
      ? settings.language
      : 'system';
  const globalUserWeights = normalizeWeights(
    data.userWeights,
    normalizedWorkouts.map((workout) => ({
      ...workout,
      exercises: workout.exercises,
    })),
  );
  const globalUserExerciseSettings = isRecord(data.userExerciseSettings)
    ? normalizeUserExerciseSettings(
        data.userExerciseSettings,
        globalUserWeights,
      )
    : buildDefaultUserExerciseSettings(globalUserWeights);
  const allSessionLogs = normalizeWorkoutSessionLogs(data.sessionLogs);

  const collection: BackupProgramCollection = {
    programs: normalizedPrograms.map((program) => {
      const programWorkouts = normalizedWorkouts
        .filter((workout) => workout.programId === program.id)
        .map((workout) => ({
          ...workout,
          exercises: workout.exercises,
        }));
      const programDayConfigs = reconcileDayConfigs(
        programWorkouts,
        normalizedDayConfigs
          .filter((dayConfig) => dayConfig.programId === program.id)
          .map(({ programId: _programId, ...dayConfig }) => dayConfig),
      );
      const alignedWorkouts = alignWorkoutsToDays(
        programWorkouts,
        programDayConfigs,
      );
      const programWeekConfigs = normalizedWeekConfigs
        .filter((weekConfig) => weekConfig.programId === program.id)
        .map(({ programId: _programId, ...weekConfig }) => weekConfig);
      const currentWeek = clampWeek(
        Number.isFinite(requestedWeek) ? requestedWeek : 1,
        programWeekConfigs,
      );
      const rawCurrentDay =
        typeof settings.currentDay === 'string' ? settings.currentDay : 'push';
      const currentDay = normalizeCurrentDay(rawCurrentDay, programDayConfigs);
      const sessionLogs = filterSessionLogsForProgram(allSessionLogs, {
        programId: program.id,
        workoutIds: new Set(alignedWorkouts.map((workout) => workout.id)),
      });

      return {
        program,
        workouts: alignedWorkouts,
        userWeights: filterWeightsForWorkouts(
          globalUserWeights,
          alignedWorkouts,
        ),
        userExerciseSettings: filterUserExerciseSettingsForWorkouts(
          globalUserExerciseSettings,
          alignedWorkouts,
        ),
        weekConfigs: programWeekConfigs,
        dayConfigs: programDayConfigs,
        currentWeek,
        currentDay,
        restDuration,
        themeMode,
        weightUnit,
        language,
        sessionLogs,
      } satisfies BackupProgramState;
    }),
    activeProgramId,
  };

  const activeProgramState =
    collection.programs.find(
      (program) => program.program.id === activeProgramId,
    ) ?? collection.programs[0];

  const runtime: PearLiftRuntimeState = activeProgramState
    ? {
        program: activeProgramState.program,
        workouts: activeProgramState.workouts,
        userWeights: activeProgramState.userWeights,
        userExerciseSettings: activeProgramState.userExerciseSettings,
        weekConfigs: activeProgramState.weekConfigs,
        dayConfigs: activeProgramState.dayConfigs,
        currentWeek: activeProgramState.currentWeek,
        currentDay: activeProgramState.currentDay,
        restDuration: activeProgramState.restDuration,
        themeMode: activeProgramState.themeMode,
        weightUnit: activeProgramState.weightUnit,
        language: activeProgramState.language,
      }
    : {
        program: null,
        workouts: cloneDefaultWorkouts(),
        userWeights: {},
        userExerciseSettings: {},
        weekConfigs: normalizeWeekConfigs([]),
        dayConfigs: normalizeDayConfigs([]),
        currentWeek: 1,
        currentDay: 'push',
        restDuration,
        themeMode,
        weightUnit,
        language,
      };

  const backup = toPearLiftBackupCollection(collection);
  backup.exportedAt = exportedAt;

  return {
    backup,
    runtime,
    sessionLogs: activeProgramState?.sessionLogs ?? [],
    collection,
  };
}

export function parseAndMigrateBackup(jsonText: string): MigratedBackupResult {
  const parsed = parseBackupJson(jsonText);
  return migrateToCurrentState(parsed);
}
