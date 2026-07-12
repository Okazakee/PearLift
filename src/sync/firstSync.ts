import type { PearLiftRuntimeState } from '@/backup/types';
import {
  buildInitialWeights,
  defaultDayConfigs,
  defaultWeekConfigs,
  defaultWorkouts,
} from '@/data/workouts';
import { buildDefaultProgram } from '@/storage/repository/defaults';
import type {
  SyncConflictSummary,
  SyncDataSummary,
} from '@/storage/types';
import type { WorkoutMutation, WorkoutStoreSnapshot } from '@/storage/types';

export type FirstSyncResolutionResult =
  | { kind: 'already_in_sync'; summary: SyncDataSummary }
  | { kind: 'auto_import_remote'; remoteSummary: SyncDataSummary }
  | { kind: 'auto_publish_local'; localSummary: SyncDataSummary }
  | {
      kind: 'auto_merge';
      localSummary: SyncDataSummary;
      remoteSummary: SyncDataSummary;
      mergedRuntime: PearLiftRuntimeState;
    }
  | {
      kind: 'requires_user_choice';
      localSummary: SyncDataSummary;
      remoteSummary: SyncDataSummary;
      conflictSummary: SyncConflictSummary;
    };

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function buildFingerprints<T extends string | number>(
  ids: T[],
  getValue: (id: T) => unknown,
) {
  const fingerprints: Record<string, string> = {};
  for (const id of ids) {
    fingerprints[String(id)] = stableStringify(getValue(id));
  }
  return fingerprints;
}

function buildRuntimeFingerprint(runtime: PearLiftRuntimeState) {
  const program = runtime.program ?? buildDefaultProgram(runtime.workouts);
  const workouts = runtime.workouts.map((workout) => ({
    id: workout.id,
    name: workout.name,
    description: workout.description,
    exercises: [...workout.exercises]
      .sort((a, b) => a.position - b.position)
      .map((exercise) => ({
        id: exercise.id,
        canonicalExerciseId: exercise.canonicalExerciseId,
        name: exercise.name,
        aliases: exercise.aliases ?? [],
        variantLabel: exercise.variantLabel,
        sessionSpecific: exercise.sessionSpecific === true,
        sets: exercise.sets,
        reps: exercise.reps,
        baseWeight: exercise.baseWeight,
        muscleGroup: exercise.muscleGroup,
        notes: exercise.notes,
        position: exercise.position,
        weight: runtime.userWeights[exercise.id] ?? exercise.baseWeight ?? 0,
      })),
  }));

  return stableStringify({
    program,
    workouts,
    weekConfigs: runtime.weekConfigs,
    dayConfigs: runtime.dayConfigs,
  });
}

function buildDefaultRuntime(): PearLiftRuntimeState {
  return {
    program: buildDefaultProgram(defaultWorkouts),
    workouts: defaultWorkouts,
    userWeights: buildInitialWeights(defaultWorkouts),
    weekConfigs: defaultWeekConfigs,
    dayConfigs: defaultDayConfigs,
    currentWeek: 1,
    currentDay: defaultDayConfigs[0]?.id ?? 'push',
    restDuration: 150,
    themeMode: 'system',
    weightUnit: 'kg',
    language: 'system',
  };
}

const DEFAULT_SYNC_FINGERPRINT = buildRuntimeFingerprint(buildDefaultRuntime());

export function summarizeRuntime(
  runtime: PearLiftRuntimeState | WorkoutStoreSnapshot,
): SyncDataSummary {
  const workoutIds = runtime.workouts.map((workout) => workout.id);
  const exerciseIds = runtime.workouts.flatMap((workout) =>
    workout.exercises.map((exercise) => exercise.id),
  );
  const workoutsById = new Map(
    runtime.workouts.map((workout) => [workout.id, workout]),
  );
  const exercisesById = new Map(
    runtime.workouts.flatMap((workout) =>
      workout.exercises.map((exercise) => [exercise.id, exercise] as const),
    ),
  );
  const weekConfigsById = new Map(
    runtime.weekConfigs.map((week) => [week.id, week]),
  );
  const dayConfigsById = new Map(runtime.dayConfigs.map((day) => [day.id, day]));
  const weightIds = Object.keys(runtime.userWeights).sort();
  const syncFingerprint = buildRuntimeFingerprint(runtime);

  return {
    workoutCount: runtime.workouts.length,
    workoutIds,
    workoutFingerprints: buildFingerprints(workoutIds, (id) =>
      workoutsById.get(id),
    ),
    exerciseCount: exerciseIds.length,
    exerciseIds,
    exerciseFingerprints: buildFingerprints(exerciseIds, (id) => ({
      exercise: exercisesById.get(id),
      weight: runtime.userWeights[id] ?? null,
    })),
    weightEntryCount: weightIds.length,
    weightFingerprints: buildFingerprints(weightIds, (id) => runtime.userWeights[id]),
    weekConfigIds: runtime.weekConfigs.map((week) => week.id),
    weekConfigFingerprints: buildFingerprints(
      runtime.weekConfigs.map((week) => week.id),
      (id) => weekConfigsById.get(id),
    ),
    dayConfigIds: runtime.dayConfigs.map((day) => day.id),
    dayConfigFingerprints: buildFingerprints(
      runtime.dayConfigs.map((day) => day.id),
      (id) => dayConfigsById.get(id),
    ),
    settingsFingerprint: 'local-preferences-excluded',
    syncFingerprint,
    isDefaultRuntime: syncFingerprint === DEFAULT_SYNC_FINGERPRINT,
  };
}

export function isSummaryEmpty(summary: SyncDataSummary) {
  return (
    summary.isDefaultRuntime ||
    (summary.workoutCount === 0 &&
      summary.exerciseCount === 0 &&
      summary.weightEntryCount === 0)
  );
}

function intersection<T extends string | number>(a: T[], b: T[]) {
  const bSet = new Set(b);
  return a.filter((item) => bSet.has(item));
}

function divergentIntersection<T extends string | number>(
  ids: T[],
  localFingerprints: Record<string, string>,
  remoteFingerprints: Record<string, string>,
) {
  return ids.filter(
    (id) => localFingerprints[String(id)] !== remoteFingerprints[String(id)],
  );
}

export function buildConflictSummary(
  local: SyncDataSummary,
  remote: SyncDataSummary,
  remoteOpCount: number,
): SyncConflictSummary {
  const overlappingWorkoutIds = divergentIntersection(
    intersection(local.workoutIds, remote.workoutIds),
    local.workoutFingerprints,
    remote.workoutFingerprints,
  );
  const overlappingExerciseIds = divergentIntersection(
    intersection(local.exerciseIds, remote.exerciseIds),
    local.exerciseFingerprints,
    remote.exerciseFingerprints,
  );
  const overlappingWeekConfigIds = divergentIntersection(
    intersection(local.weekConfigIds, remote.weekConfigIds),
    local.weekConfigFingerprints,
    remote.weekConfigFingerprints,
  );
  const overlappingDayConfigIds = divergentIntersection(
    intersection(local.dayConfigIds, remote.dayConfigIds),
    local.dayConfigFingerprints,
    remote.dayConfigFingerprints,
  );
  const settingsConflict = false;
  const requiresManualChoice =
    overlappingWorkoutIds.length > 0 ||
    overlappingExerciseIds.length > 0 ||
    overlappingWeekConfigIds.length > 0 ||
    overlappingDayConfigIds.length > 0 ||
    settingsConflict ||
    remoteOpCount > 24;

  return {
    overlappingWorkoutIds,
    overlappingExerciseIds,
    overlappingWeekConfigIds,
    overlappingDayConfigIds,
    settingsConflict,
    remoteOpCount,
    requiresManualChoice,
  };
}

function mergeWeights(
  local: PearLiftRuntimeState,
  remote: PearLiftRuntimeState,
): PearLiftRuntimeState['userWeights'] {
  return {
    ...remote.userWeights,
    ...local.userWeights,
  };
}

function assertDisjointIds<T extends { id: string | number }>(
  label: string,
  a: T[],
  b: T[],
) {
  const bIds = new Set(b.map((item) => item.id));
  const overlap = a.filter((item) => bIds.has(item.id));
  if (overlap.length > 0) {
    throw new Error(
      `mergeDisjointRuntime: overlapping ${label} IDs detected — ${overlap.map((item) => item.id).join(', ')}`,
    );
  }
}

export function mergeDisjointRuntime(
  local: PearLiftRuntimeState,
  remote: PearLiftRuntimeState,
): PearLiftRuntimeState {
  assertDisjointIds('workout', local.workouts, remote.workouts);
  assertDisjointIds('weekConfig', local.weekConfigs, remote.weekConfigs);
  assertDisjointIds('dayConfig', local.dayConfigs, remote.dayConfigs);

  const localExerciseIds = new Set(
    local.workouts.flatMap((w) => w.exercises.map((e) => e.id)),
  );
  const remoteExerciseIds = new Set(
    remote.workouts.flatMap((w) => w.exercises.map((e) => e.id)),
  );
  const overlappingExercises = [...localExerciseIds].filter((id) =>
    remoteExerciseIds.has(id),
  );
  if (overlappingExercises.length > 0) {
    throw new Error(
      `mergeDisjointRuntime: overlapping exercise IDs detected — ${overlappingExercises.join(', ')}`,
    );
  }

  return {
    workouts: [...remote.workouts, ...local.workouts],
    userWeights: mergeWeights(local, remote),
    weekConfigs: [...remote.weekConfigs, ...local.weekConfigs],
    dayConfigs: [...remote.dayConfigs, ...local.dayConfigs],
    currentWeek: local.currentWeek,
    currentDay: local.currentDay,
    restDuration: local.restDuration,
    themeMode: local.themeMode,
    weightUnit: local.weightUnit,
    language: local.language,
  };
}

export function resolveFirstSync(
  localRuntime: PearLiftRuntimeState,
  remoteRuntime: PearLiftRuntimeState | null,
  remoteOpCount: number,
): FirstSyncResolutionResult {
  const localSummary = summarizeRuntime(localRuntime);

  if (!remoteRuntime) {
    return {
      kind: 'auto_publish_local',
      localSummary,
    };
  }

  const remoteSummary = summarizeRuntime(remoteRuntime);
  if (localSummary.syncFingerprint === remoteSummary.syncFingerprint) {
    return {
      kind: 'already_in_sync',
      summary: localSummary,
    };
  }
  if (isSummaryEmpty(localSummary)) {
    return {
      kind: 'auto_import_remote',
      remoteSummary,
    };
  }
  if (isSummaryEmpty(remoteSummary)) {
    return {
      kind: 'auto_publish_local',
      localSummary,
    };
  }

  const conflictSummary = buildConflictSummary(
    localSummary,
    remoteSummary,
    remoteOpCount,
  );

  if (!conflictSummary.requiresManualChoice) {
    return {
      kind: 'auto_merge',
      localSummary,
      remoteSummary,
      mergedRuntime: mergeDisjointRuntime(localRuntime, remoteRuntime),
    };
  }

  return {
    kind: 'requires_user_choice',
    localSummary,
    remoteSummary,
    conflictSummary,
  };
}

export function isSyncResetMutation(mutation: WorkoutMutation) {
  return (
    mutation.type === 'resetWorkoutData' ||
    mutation.type === 'resetAllData' ||
    mutation.type === 'restoreRuntimeState'
  );
}
