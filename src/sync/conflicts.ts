import type { PearLiftRuntimeState } from '../backup/types';
import type {
  SyncDeviceProfilePayload,
  SyncMutation,
  SyncOpEnvelope,
  SyncPayload,
  SyncSnapshotReplacePayload,
} from './types';

export function getOpPayload(
  op: SyncOpEnvelope,
): SyncPayload {
  if (op.payload) {
    return op.payload;
  }

  if (op.mutation) {
    return {
      kind: 'mutation',
      mutation: op.mutation,
    };
  }

  throw new Error(`Sync op ${op.opId} is missing payload.`);
}

export function cloneRuntime(runtime: PearLiftRuntimeState): PearLiftRuntimeState {
  return JSON.parse(JSON.stringify(runtime)) as PearLiftRuntimeState;
}

export function mutationsConflict(local: SyncMutation, remote: SyncMutation) {
  if (
    local.type === 'replaceWeekConfigs' &&
    remote.type === 'replaceWeekConfigs'
  ) {
    return true;
  }
  if (
    local.type === 'replaceDayConfigs' &&
    remote.type === 'replaceDayConfigs'
  ) {
    return true;
  }
  if (
    local.type === 'setExerciseWeight' &&
    remote.type === 'setExerciseWeight' &&
    local.exerciseId === remote.exerciseId
  ) {
    return true;
  }
  if (
    local.type === 'editExercise' &&
    remote.type === 'editExercise' &&
    local.exerciseId === remote.exerciseId
  ) {
    return true;
  }
  if (
    local.type === 'deleteExercise' &&
    (remote.type === 'deleteExercise' ||
      remote.type === 'editExercise' ||
      remote.type === 'setExerciseWeight') &&
    'exerciseId' in remote &&
    local.exerciseId === remote.exerciseId
  ) {
    return true;
  }
  if (
    remote.type === 'deleteExercise' &&
    (local.type === 'editExercise' ||
      local.type === 'setExerciseWeight' ||
      local.type === 'deleteExercise') &&
    local.exerciseId === remote.exerciseId
  ) {
    return true;
  }
  if (
    local.type === 'reorderExercises' &&
    (remote.type === 'reorderExercises' ||
      remote.type === 'addExercise' ||
      remote.type === 'deleteExercise') &&
    remote.workoutId === local.workoutId
  ) {
    return true;
  }
  if (
    remote.type === 'reorderExercises' &&
    (local.type === 'reorderExercises' ||
      local.type === 'addExercise' ||
      local.type === 'deleteExercise') &&
    local.workoutId === remote.workoutId
  ) {
    return true;
  }
  return false;
}

function applyMutationPreview(
  runtime: PearLiftRuntimeState,
  mutation: SyncMutation,
): PearLiftRuntimeState {
  const next = cloneRuntime(runtime);
  switch (mutation.type) {
    case 'setExerciseWeight':
      next.userWeights[mutation.exerciseId] = mutation.value;
      return next;
    case 'addExercise': {
      const workout = next.workouts.find(
        (item) => item.id === mutation.workoutId,
      );
      if (!workout) return next;
      workout.exercises.push({
        id: `${mutation.workoutId}-${workout.exercises.length + 1}`,
        ...mutation.exercise,
        baseWeight: 0,
        position: workout.exercises.length,
      });
      return next;
    }
    case 'editExercise': {
      for (const workout of next.workouts) {
        const exercise = workout.exercises.find(
          (item) => item.id === mutation.exerciseId,
        );
        if (!exercise) continue;
        Object.assign(exercise, mutation.updates);
        return next;
      }
      return next;
    }
    case 'deleteExercise':
      for (const workout of next.workouts) {
        workout.exercises = workout.exercises
          .filter((item) => item.id !== mutation.exerciseId)
          .map((item, index) => ({ ...item, position: index }));
      }
      delete next.userWeights[mutation.exerciseId];
      return next;
    case 'reorderExercises': {
      const workout = next.workouts.find(
        (item) => item.id === mutation.workoutId,
      );
      if (!workout) return next;
      const byId = new Map(workout.exercises.map((item) => [item.id, item]));
      workout.exercises = mutation.orderedExerciseIds
        .map((id) => byId.get(id))
        .filter((item): item is NonNullable<typeof item> => !!item)
        .map((item, index) => ({ ...item, position: index }));
      return next;
    }
    case 'replaceWeekConfigs':
      next.weekConfigs = mutation.weekConfigs;
      return next;
    case 'replaceDayConfigs':
      next.dayConfigs = mutation.dayConfigs;
      return next;
  }
}

export function applyOpsToRuntimePreview(
  runtime: PearLiftRuntimeState,
  ops: SyncOpEnvelope[],
  getOpPayloadFn: typeof getOpPayload,
) {
  let next = cloneRuntime(runtime);
  for (const op of ops) {
    const payload = getOpPayloadFn(op);
    if (payload.kind === 'snapshot_replace') {
      next = cloneRuntime(payload.runtime);
      continue;
    }
    if (payload.kind !== 'mutation') {
      continue;
    }
    next = applyMutationPreview(next, payload.mutation);
  }
  return next;
}
