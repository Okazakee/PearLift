import type { PearLiftRuntimeState } from '../backup/types';
import type {
  SyncConflictSummary,
  SyncDataSummary,
} from '../storage/types';
import type { WorkoutMutation, WorkoutStoreSnapshot } from '../storage/types';

export type FirstSyncResolutionResult =
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

function fingerprintSettings(runtime: PearLiftRuntimeState) {
  return JSON.stringify({
    currentWeek: runtime.currentWeek,
    currentDay: runtime.currentDay,
    restDuration: runtime.restDuration,
    themeMode: runtime.themeMode,
    weightUnit: runtime.weightUnit,
    language: runtime.language,
  });
}

export function summarizeRuntime(
  runtime: PearLiftRuntimeState | WorkoutStoreSnapshot,
): SyncDataSummary {
  const workoutIds = runtime.workouts.map((workout) => workout.id);
  const exerciseIds = runtime.workouts.flatMap((workout) =>
    workout.exercises.map((exercise) => exercise.id),
  );
  return {
    workoutCount: runtime.workouts.length,
    workoutIds,
    exerciseCount: exerciseIds.length,
    exerciseIds,
    weightEntryCount: Object.keys(runtime.userWeights).length,
    weekConfigIds: runtime.weekConfigs.map((week) => week.id),
    dayConfigIds: runtime.dayConfigs.map((day) => day.id),
    settingsFingerprint: fingerprintSettings(runtime),
  };
}

export function isSummaryEmpty(summary: SyncDataSummary) {
  return (
    summary.workoutCount === 0 &&
    summary.exerciseCount === 0 &&
    summary.weightEntryCount === 0
  );
}

function intersection<T extends string | number>(a: T[], b: T[]) {
  const bSet = new Set(b);
  return a.filter((item) => bSet.has(item));
}

export function buildConflictSummary(
  local: SyncDataSummary,
  remote: SyncDataSummary,
  remoteOpCount: number,
): SyncConflictSummary {
  const overlappingWorkoutIds = intersection(local.workoutIds, remote.workoutIds);
  const overlappingExerciseIds = intersection(
    local.exerciseIds,
    remote.exerciseIds,
  );
  const overlappingWeekConfigIds = intersection(
    local.weekConfigIds,
    remote.weekConfigIds,
  );
  const overlappingDayConfigIds = intersection(
    local.dayConfigIds,
    remote.dayConfigIds,
  );
  const settingsConflict = local.settingsFingerprint !== remote.settingsFingerprint;
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

export function mergeDisjointRuntime(
  local: PearLiftRuntimeState,
  remote: PearLiftRuntimeState,
): PearLiftRuntimeState {
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
