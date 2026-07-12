import type { PearLiftRuntimeState } from '@/backup/types';
import type { UserExerciseSettingsMap, WorkoutSessionLog } from '@/types';

function remapWeightMap(
  weights: PearLiftRuntimeState['userWeights'],
  exerciseIdMap: Map<string, string>,
) {
  const nextWeights: PearLiftRuntimeState['userWeights'] = {};

  for (const [exerciseId, value] of Object.entries(weights)) {
    const mappedExerciseId = exerciseIdMap.get(exerciseId) ?? exerciseId;
    nextWeights[mappedExerciseId] = value;
  }

  return nextWeights;
}

function remapUserExerciseSettings(
  settings: UserExerciseSettingsMap | undefined,
  exerciseIdMap: Map<string, string>,
): UserExerciseSettingsMap {
  if (!settings) {
    return {};
  }

  const nextSettings: UserExerciseSettingsMap = {};
  for (const [exerciseId, value] of Object.entries(settings)) {
    const mappedExerciseId = exerciseIdMap.get(exerciseId) ?? exerciseId;
    nextSettings[mappedExerciseId] = {
      ...value,
      exerciseId: mappedExerciseId,
    };
  }

  return nextSettings;
}

function remapSessionLogs(
  sessionLogs: WorkoutSessionLog[],
  input: {
    programId: string;
    workoutIdMap: Map<string, string>;
    exerciseIdMap: Map<string, string>;
  },
): WorkoutSessionLog[] {
  const { programId, workoutIdMap, exerciseIdMap } = input;

  return sessionLogs.map((log) => ({
    ...log,
    id: `${programId}__${log.id}`,
    programId,
    workoutId: workoutIdMap.get(log.workoutId) ?? log.workoutId,
    exerciseLogs: log.exerciseLogs.map((exerciseLog) => ({
      ...exerciseLog,
      exerciseId:
        exerciseIdMap.get(exerciseLog.exerciseId) ?? exerciseLog.exerciseId,
      prescriptionSnapshot: exerciseLog.prescriptionSnapshot
        ? {
            ...exerciseLog.prescriptionSnapshot,
            id:
              exerciseIdMap.get(exerciseLog.prescriptionSnapshot.id) ??
              exerciseLog.prescriptionSnapshot.id,
          }
        : exerciseLog.prescriptionSnapshot,
    })),
  }));
}

export function buildImportedProgramId(
  baseId: string,
  existingProgramIds: Set<string>,
): string {
  const normalizedBase = baseId.trim().length > 0 ? baseId.trim() : 'program';
  if (!existingProgramIds.has(normalizedBase)) {
    return normalizedBase;
  }

  let copyNumber = 1;
  let candidate = `${normalizedBase}-copy`;
  while (existingProgramIds.has(candidate)) {
    copyNumber += 1;
    candidate = `${normalizedBase}-copy-${copyNumber}`;
  }
  return candidate;
}

export function remapImportedProgram(args: {
  runtime: PearLiftRuntimeState;
  sessionLogs: WorkoutSessionLog[];
  programId: string;
  prefixChildIds: boolean;
}): {
  runtime: PearLiftRuntimeState;
  sessionLogs: WorkoutSessionLog[];
} {
  const { runtime, sessionLogs, programId, prefixChildIds } = args;

  const workoutIdMap = new Map<string, string>();
  for (const workout of runtime.workouts) {
    workoutIdMap.set(
      workout.id,
      prefixChildIds ? `${programId}__${workout.id}` : workout.id,
    );
  }

  const exerciseIdMap = new Map<string, string>();
  for (const workout of runtime.workouts) {
    for (const exercise of workout.exercises) {
      exerciseIdMap.set(
        exercise.id,
        prefixChildIds ? `${programId}__${exercise.id}` : exercise.id,
      );
    }
  }

  const workouts = runtime.workouts.map((workout) => ({
    ...workout,
    id: workoutIdMap.get(workout.id) ?? workout.id,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      id: exerciseIdMap.get(exercise.id) ?? exercise.id,
    })),
  }));

  const program = runtime.program
    ? {
        ...runtime.program,
        id: programId,
        workoutIds: runtime.program.workoutIds.map(
          (workoutId) => workoutIdMap.get(workoutId) ?? workoutId,
        ),
      }
    : null;

  const dayConfigs = runtime.dayConfigs.map((dayConfig) => ({
    ...dayConfig,
    id: workoutIdMap.get(dayConfig.id) ?? dayConfig.id,
  }));

  const nextCurrentDay =
    workoutIdMap.get(runtime.currentDay) ?? runtime.currentDay;

  return {
    runtime: {
      ...runtime,
      program,
      workouts,
      dayConfigs,
      currentDay: nextCurrentDay,
      userWeights: remapWeightMap(runtime.userWeights, exerciseIdMap),
      userExerciseSettings: remapUserExerciseSettings(
        runtime.userExerciseSettings,
        exerciseIdMap,
      ),
    },
    sessionLogs: remapSessionLogs(sessionLogs, {
      programId,
      workoutIdMap,
      exerciseIdMap,
    }),
  };
}
