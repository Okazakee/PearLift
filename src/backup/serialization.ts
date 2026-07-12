import {
  type BackupProgramCollection,
  CURRENT_BACKUP_FORMAT,
  CURRENT_BACKUP_VERSION,
  type PearLiftBackupDayConfig,
  type PearLiftBackupV4,
  type PearLiftBackupWeekConfig,
  type PearLiftRuntimeState,
} from '@/backup/types';
import type { WorkoutSessionLog } from '@/types';

function toBackupWeekConfigs(
  collection: BackupProgramCollection,
): PearLiftBackupWeekConfig[] {
  return collection.programs.flatMap((programState) =>
    programState.weekConfigs.map((weekConfig) => ({
      ...weekConfig,
      programId: programState.program.id,
    })),
  );
}

function toBackupDayConfigs(
  collection: BackupProgramCollection,
): PearLiftBackupDayConfig[] {
  return collection.programs.flatMap((programState) =>
    programState.dayConfigs.map((dayConfig) => ({
      ...dayConfig,
      programId: programState.program.id,
    })),
  );
}

function toCollectionWeights(collection: BackupProgramCollection) {
  const weights: PearLiftRuntimeState['userWeights'] = {};

  for (const programState of collection.programs) {
    for (const [exerciseId, value] of Object.entries(
      programState.userWeights,
    )) {
      weights[exerciseId] = value;
    }
  }

  return weights;
}

function toCollectionUserExerciseSettings(collection: BackupProgramCollection) {
  const settings: NonNullable<PearLiftRuntimeState['userExerciseSettings']> =
    {};

  for (const programState of collection.programs) {
    for (const [exerciseId, value] of Object.entries(
      programState.userExerciseSettings ?? {},
    )) {
      settings[exerciseId] = value;
    }
  }

  return settings;
}

function toCollectionSessionLogs(collection: BackupProgramCollection) {
  return collection.programs.flatMap(
    (programState) => programState.sessionLogs,
  );
}

export function toPearLiftBackupCollection(
  collection: BackupProgramCollection,
): PearLiftBackupV4 {
  const activeProgramState =
    collection.programs.find(
      (programState) => programState.program.id === collection.activeProgramId,
    ) ?? collection.programs[0];
  const settingsSource = activeProgramState ?? null;

  return {
    version: CURRENT_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: {
      name: 'PearLift',
      platform: 'mobile',
      backupFormat: CURRENT_BACKUP_FORMAT,
    },
    data: {
      program: activeProgramState?.program ?? null,
      programs: collection.programs.map((programState) => programState.program),
      ...(collection.activeProgramId
        ? { activeProgramId: collection.activeProgramId }
        : {}),
      workouts: collection.programs.flatMap((programState) =>
        programState.workouts.map((workout) => ({
          ...workout,
          programId: programState.program.id,
          exercises: workout.exercises.map((exercise, index) => ({
            ...exercise,
            notes: exercise.notes ?? '',
            position: Number.isFinite(Number(exercise.position))
              ? exercise.position
              : index,
          })),
        })),
      ),
      userWeights: toCollectionWeights(collection),
      userExerciseSettings: toCollectionUserExerciseSettings(collection),
      ...(toCollectionSessionLogs(collection).length > 0
        ? { sessionLogs: toCollectionSessionLogs(collection) }
        : {}),
      weekConfigs: toBackupWeekConfigs(collection),
      dayConfigs: toBackupDayConfigs(collection),
      settings: {
        currentWeek: settingsSource?.currentWeek ?? 1,
        currentDay: settingsSource?.currentDay ?? 'push',
        restDuration: settingsSource?.restDuration ?? 150,
        themeMode: settingsSource?.themeMode ?? 'system',
        weightUnit: settingsSource?.weightUnit ?? 'kg',
        language: settingsSource?.language ?? 'system',
      },
    },
  };
}

export function toPearLiftBackup(
  state: PearLiftRuntimeState,
  sessionLogs: WorkoutSessionLog[] = [],
): PearLiftBackupV4 {
  const program = state.program ?? {
    id: 'main-program',
    name: 'Main Program',
    workoutIds: state.workouts.map((workout) => workout.id),
  };

  return toPearLiftBackupCollection({
    programs: [
      {
        ...state,
        program,
        sessionLogs,
      },
    ],
    activeProgramId: program.id,
  });
}

export function serializePearLiftBackup(
  state: PearLiftRuntimeState,
  sessionLogs: WorkoutSessionLog[] = [],
): string {
  return JSON.stringify(toPearLiftBackup(state, sessionLogs), null, 2);
}

export function serializePearLiftBackupCollection(
  collection: BackupProgramCollection,
): string {
  return JSON.stringify(toPearLiftBackupCollection(collection), null, 2);
}

export const toPearLiftBackupV3 = toPearLiftBackup;
export const serializePearLiftBackupV3 = serializePearLiftBackup;
