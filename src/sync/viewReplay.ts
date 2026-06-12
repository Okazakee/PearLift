import { alignWorkoutsToDays } from '@/backup/normalization';
import type { PearLiftRuntimeState } from '@/backup/types';
import { buildDefaultRuntimeState, normalizeDayConfigs } from '@/storage/repository/defaults';
import type { SyncDeviceProfile, SyncMutation, SyncOpEnvelope } from '@/sync/types';
import { cloneRuntime, getOpPayload } from '@/sync/conflicts';

export interface SyncAppliedOpMeta {
  opId: string;
  deviceId: string;
  lamport: number;
}

export interface SyncProjectedDevice extends SyncDeviceProfile {
  lastSeen: string;
}

export interface SyncViewProjection {
  runtime: PearLiftRuntimeState;
  devices: SyncProjectedDevice[];
  appliedOps: SyncAppliedOpMeta[];
  sharedOpCount: number;
}

export function isSharedSyncOp(op: SyncOpEnvelope) {
  const payload = getOpPayload(op);
  return payload.kind === 'snapshot_replace' || payload.kind === 'mutation';
}

function applySyncMutation(
  runtime: PearLiftRuntimeState,
  mutation: SyncMutation,
  opId: string,
): PearLiftRuntimeState {
  const next = cloneRuntime(runtime);

  switch (mutation.type) {
    case 'setExerciseWeight': {
      const exerciseExists = next.workouts.some((workout) =>
        workout.exercises.some((exercise) => exercise.id === mutation.exerciseId),
      );
      if (!exerciseExists) {
        return next;
      }
      next.userWeights[mutation.exerciseId] = Math.max(0, mutation.value);
      return next;
    }
    case 'addExercise': {
      const workout = next.workouts.find(
        (item) => item.id === mutation.workoutId,
      );
      if (!workout) {
        return next;
      }
      const exerciseId =
        mutation.exercise.id ?? `${mutation.workoutId}:${opId}`;
      const nextPosition =
        workout.exercises.length > 0
          ? Math.max(...workout.exercises.map((exercise) => exercise.position)) + 1
          : 0;
      workout.exercises.push({
        id: exerciseId,
        name: mutation.exercise.name,
        sets: mutation.exercise.sets,
        reps: mutation.exercise.reps,
        baseWeight: 0,
        muscleGroup: mutation.exercise.muscleGroup,
        notes: mutation.exercise.notes,
        position: nextPosition,
      });
      next.userWeights[exerciseId] = 0;
      return next;
    }
    case 'editExercise': {
      for (const workout of next.workouts) {
        const exercise = workout.exercises.find(
          (item) => item.id === mutation.exerciseId,
        );
        if (!exercise) {
          continue;
        }
        exercise.name = mutation.updates.name ?? exercise.name;
        exercise.sets = mutation.updates.sets ?? exercise.sets;
        exercise.reps = mutation.updates.reps ?? exercise.reps;
        exercise.baseWeight = mutation.updates.baseWeight ?? exercise.baseWeight;
        exercise.muscleGroup =
          mutation.updates.muscleGroup ?? exercise.muscleGroup;
        exercise.notes = mutation.updates.notes ?? exercise.notes;
        exercise.position = mutation.updates.position ?? exercise.position;
        return next;
      }
      return next;
    }
    case 'deleteExercise': {
      for (const workout of next.workouts) {
        workout.exercises = workout.exercises
          .filter((item) => item.id !== mutation.exerciseId)
          .map((item, index) => ({
            ...item,
            position: index,
          }));
      }
      delete next.userWeights[mutation.exerciseId];
      return next;
    }
    case 'reorderExercises': {
      const workout = next.workouts.find(
        (item) => item.id === mutation.workoutId,
      );
      if (!workout) {
        return next;
      }
      const existingIds = new Set(workout.exercises.map((exercise) => exercise.id));
      const nextOrder = mutation.orderedExerciseIds.filter((id) =>
        existingIds.has(id),
      );
      if (nextOrder.length !== workout.exercises.length) {
        for (const exercise of workout.exercises) {
          if (!nextOrder.includes(exercise.id)) {
            nextOrder.push(exercise.id);
          }
        }
      }
      const byId = new Map(workout.exercises.map((exercise) => [exercise.id, exercise]));
      workout.exercises = nextOrder
        .map((id) => byId.get(id))
        .filter((item): item is NonNullable<typeof item> => item != null)
        .map((item, index) => ({
          ...item,
          position: index,
        }));
      return next;
    }
    case 'replaceWeekConfigs':
      next.weekConfigs = mutation.weekConfigs;
      return next;
    case 'replaceDayConfigs': {
      const nextDayConfigs = normalizeDayConfigs([], mutation.dayConfigs, {
        fallbackToDefault: false,
      });
      next.workouts = alignWorkoutsToDays(next.workouts, nextDayConfigs);
      next.dayConfigs = nextDayConfigs;
      const currentDayStillExists = nextDayConfigs.some(
        (day) => day.id === next.currentDay,
      );
      next.currentDay = currentDayStillExists
        ? next.currentDay
        : (nextDayConfigs[0]?.id ?? next.currentDay);
      return next;
    }
  }
}

export function buildRuntimeFromSyncView(
  ops: SyncOpEnvelope[],
): PearLiftRuntimeState {
  let runtime = buildDefaultRuntimeState();

  for (const op of ops) {
    const payload = getOpPayload(op);
    if (payload.kind === 'snapshot_replace') {
      runtime = cloneRuntime(payload.runtime);
      continue;
    }
    if (payload.kind !== 'mutation') {
      continue;
    }
    runtime = applySyncMutation(runtime, payload.mutation, op.opId);
  }

  return runtime;
}

export function buildSyncViewProjection(
  ops: SyncOpEnvelope[],
): SyncViewProjection {
  const appliedOps: SyncAppliedOpMeta[] = [];
  const deviceProfiles = new Map<string, SyncProjectedDevice>();
  const sharedOps = ops.filter(isSharedSyncOp);

  for (const op of ops) {
    appliedOps.push({
      opId: op.opId,
      deviceId: op.deviceId,
      lamport: op.lamport,
    });

    const payload = getOpPayload(op);
    if (payload.kind !== 'device_profile') {
      continue;
    }
    deviceProfiles.set(payload.profile.deviceId, {
      ...payload.profile,
      lastSeen: op.createdAt,
    });
  }

  return {
    runtime: buildRuntimeFromSyncView(sharedOps),
    devices: [...deviceProfiles.values()],
    appliedOps,
    sharedOpCount: sharedOps.length,
  };
}
