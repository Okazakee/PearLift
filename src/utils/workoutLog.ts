import { nowIso } from '@/storage/repository/defaults';
import type {
  Exercise,
  ExerciseRirTarget,
  ExerciseSessionLog,
  LoggedSet,
  TrainingProgram,
  WorkoutSession,
  WorkoutSessionLog,
} from '@/types';
import { formatRepsLabel } from '@/utils/exerciseAdvanced';
import { getExerciseTargetForWeek } from '@/utils/exerciseTargets';
import { getRestSeconds } from '@/utils/rest';

function buildSessionId(workoutId: string, currentWeek: number) {
  return `${workoutId}:${currentWeek}:${Date.now().toString(36)}`;
}

function cloneExerciseSnapshot(exercise: Exercise): Exercise {
  return JSON.parse(JSON.stringify(exercise)) as Exercise;
}

export function hasExplicitExerciseRirTarget(exercise: Exercise): boolean {
  if (exercise.advanced?.rir) {
    return true;
  }

  if (exercise.advanced?.perSetTargets?.some((item) => item.rir != null)) {
    return true;
  }

  return (
    exercise.advanced?.weekOverrides?.some((item) => item.rir != null) ?? false
  );
}

function getPerSetTarget(exercise: Exercise, setIndex: number) {
  return exercise.advanced?.perSetTargets?.find(
    (target) => target.setNumber === setIndex + 1,
  );
}

function resolveTargetRirValue(
  target: ExerciseRirTarget | undefined,
  setIndex: number,
  setCount: number,
  weekRir?: number | null,
): LoggedSet['targetRir'] {
  if (!target) {
    return weekRir ?? undefined;
  }

  if (target.type === 'last_set_override') {
    if (setIndex === setCount - 1 && target.lastSet != null) {
      return target.lastSet;
    }
    if (target.value != null) {
      return target.value;
    }
    return target.label;
  }

  if (target.type === 'per_set') {
    const value = target.values?.[setIndex];
    return value != null ? value : target.label;
  }

  if (target.type === 'fixed' && target.value != null) {
    return target.value;
  }

  return target.label;
}

function resolveTargetRepsLabel(exercise: Exercise, setIndex: number): string {
  const perSetTarget = getPerSetTarget(exercise, setIndex);
  return formatRepsLabel(
    perSetTarget?.reps ?? exercise.reps,
    exercise.advanced?.unilateral,
  );
}

function buildPrescriptionSnapshot(input: {
  exercise: Exercise;
  workout?: WorkoutSession | null;
  currentWeek: number;
  program?: TrainingProgram | null;
  settingsRestSeconds: number;
  weekRir?: number | null;
}): Exercise {
  const resolved = cloneExerciseSnapshot(
    getExerciseTargetForWeek(input.exercise, input.currentWeek),
  );
  const nextAdvanced = resolved.advanced ? { ...resolved.advanced } : undefined;
  const restSeconds = getRestSeconds({
    exercise: resolved,
    workout: input.workout,
    program: input.program,
    settingsRestSeconds: input.settingsRestSeconds,
  });

  const effectiveRir =
    resolved.advanced?.rir ??
    (input.weekRir != null
      ? {
          type: 'fixed' as const,
          label: String(input.weekRir),
          value: input.weekRir,
        }
      : undefined);

  return {
    ...resolved,
    advanced:
      restSeconds != null || effectiveRir || nextAdvanced
        ? {
            ...nextAdvanced,
            ...(restSeconds != null ? { restSeconds } : {}),
            ...(effectiveRir ? { rir: effectiveRir } : {}),
          }
        : undefined,
  };
}

function buildLoggedSet(input: {
  exercise: Exercise;
  setIndex: number;
  setCount: number;
  plannedWeight: number;
  targetRir?: ExerciseRirTarget;
  weekRir?: number | null;
}): LoggedSet {
  const perSetTarget = getPerSetTarget(input.exercise, input.setIndex);

  return {
    setNumber: input.setIndex + 1,
    targetRepsLabel: resolveTargetRepsLabel(input.exercise, input.setIndex),
    plannedWeight: input.plannedWeight,
    targetRir: resolveTargetRirValue(
      perSetTarget?.rir ?? input.targetRir,
      input.setIndex,
      input.setCount,
      input.weekRir,
    ),
    completed: false,
    skipped: false,
  };
}

function buildExerciseLog(input: {
  exercise: Exercise;
  workout?: WorkoutSession | null;
  currentWeek: number;
  program?: TrainingProgram | null;
  settingsRestSeconds: number;
  weekRir?: number | null;
  getAdjustedWeight: (exerciseId: string, weekId?: number) => number;
}): ExerciseSessionLog {
  const prescriptionSnapshot = buildPrescriptionSnapshot(input);
  const plannedWeight = input.getAdjustedWeight(
    prescriptionSnapshot.id,
    input.currentWeek,
  );

  return {
    exerciseId: prescriptionSnapshot.id,
    exerciseNameSnapshot: prescriptionSnapshot.name,
    prescriptionSnapshot,
    plannedWeight,
    sets: Array.from({ length: prescriptionSnapshot.sets }, (_, index) =>
      buildLoggedSet({
        exercise: prescriptionSnapshot,
        setIndex: index,
        setCount: prescriptionSnapshot.sets,
        plannedWeight,
        targetRir: prescriptionSnapshot.advanced?.rir,
        weekRir: input.weekRir,
      }),
    ),
  };
}

export function buildWorkoutSessionLog(input: {
  workout: WorkoutSession;
  program?: TrainingProgram | null;
  currentWeek: number;
  weekRir?: number | null;
  settingsRestSeconds: number;
  getAdjustedWeight: (exerciseId: string, weekId?: number) => number;
  startedAt?: string;
}): WorkoutSessionLog {
  const orderedExercises = [...input.workout.exercises].sort(
    (a, b) => a.position - b.position,
  );

  return {
    id: buildSessionId(input.workout.id, input.currentWeek),
    programId: input.program?.id,
    workoutId: input.workout.id,
    workoutNameSnapshot: input.workout.name,
    startedAt: input.startedAt ?? nowIso(),
    weekNumber: input.currentWeek,
    exerciseLogs: orderedExercises.map((exercise) =>
      buildExerciseLog({
        exercise,
        workout: input.workout,
        currentWeek: input.currentWeek,
        program: input.program,
        settingsRestSeconds: input.settingsRestSeconds,
        weekRir: input.weekRir,
        getAdjustedWeight: input.getAdjustedWeight,
      }),
    ),
  };
}

export function getQuickCompleteReps(value: string): number | undefined {
  const matches = value.match(/\d+(?:\.\d+)?/g);
  if (!matches?.length) {
    return undefined;
  }

  const parsed = matches
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));

  if (!parsed.length) {
    return undefined;
  }

  return Math.max(...parsed);
}

export function getEffectiveLoggedReps(set: LoggedSet): number | undefined {
  if (set.actualReps != null) {
    return set.actualReps;
  }
  if (set.actualLeftReps != null && set.actualRightReps != null) {
    return Math.min(set.actualLeftReps, set.actualRightReps);
  }
  return undefined;
}

export function getEffectiveLoggedWeight(set: LoggedSet): number | undefined {
  return set.actualWeight ?? set.plannedWeight;
}

export interface ExerciseHistorySummary {
  workoutLogId: string;
  exerciseId: string;
  exerciseName: string;
  variantLabel?: string;
  workoutName: string;
  performedAt: string;
  loggedWeightKg?: number;
  bestReps?: number;
  completedSets: number;
  totalSets: number;
}

function getExerciseHistoryGroupId(exercise: Exercise) {
  return exercise.canonicalExerciseId ?? exercise.id;
}

function historyMatchesTarget(
  exerciseLog: ExerciseSessionLog,
  targetExercise: Exercise,
  includeLinkedVariants: boolean,
) {
  if (exerciseLog.exerciseId === targetExercise.id) {
    return true;
  }
  if (!includeLinkedVariants) {
    return false;
  }

  const snapshot = exerciseLog.prescriptionSnapshot;
  if (!snapshot) {
    return false;
  }

  return (
    getExerciseHistoryGroupId(snapshot) ===
    getExerciseHistoryGroupId(targetExercise)
  );
}

function getExerciseLogLastWeight(
  exerciseLog: ExerciseSessionLog,
): number | undefined {
  for (let index = exerciseLog.sets.length - 1; index >= 0; index -= 1) {
    const set = exerciseLog.sets[index];
    if (!set) {
      continue;
    }
    const weight = getEffectiveLoggedWeight(set);
    if (weight != null) {
      return weight;
    }
  }

  return exerciseLog.plannedWeight;
}

export function getExerciseHistorySummary(
  workoutLog: WorkoutSessionLog,
  targetExercise: Exercise,
  includeLinkedVariants = false,
): ExerciseHistorySummary | null {
  const exerciseLog = workoutLog.exerciseLogs.find((item) =>
    historyMatchesTarget(item, targetExercise, includeLinkedVariants),
  );
  if (!exerciseLog) {
    return null;
  }

  const bestReps = exerciseLog.sets.reduce<number | undefined>((best, set) => {
    const reps = getEffectiveLoggedReps(set);
    if (reps == null) {
      return best;
    }
    return best == null || reps > best ? reps : best;
  }, undefined);

  return {
    workoutLogId: workoutLog.id,
    exerciseId: exerciseLog.exerciseId,
    exerciseName: exerciseLog.exerciseNameSnapshot,
    ...(exerciseLog.prescriptionSnapshot?.variantLabel
      ? { variantLabel: exerciseLog.prescriptionSnapshot.variantLabel }
      : {}),
    workoutName: workoutLog.workoutNameSnapshot,
    performedAt: workoutLog.completedAt ?? workoutLog.startedAt,
    loggedWeightKg: getExerciseLogLastWeight(exerciseLog),
    bestReps,
    completedSets: exerciseLog.sets.filter(
      (set) => set.completed && !set.skipped,
    ).length,
    totalSets: exerciseLog.sets.length,
  };
}

export function updateWorkoutLogSet(
  session: WorkoutSessionLog,
  input: {
    exerciseId: string;
    setNumber: number;
    actualWeight?: number;
    actualReps?: number;
    actualLeftReps?: number;
    actualRightReps?: number;
    actualRir?: number;
    completed?: boolean;
    skipped?: boolean;
  },
): WorkoutSessionLog {
  return {
    ...session,
    exerciseLogs: session.exerciseLogs.map((exerciseLog) => {
      if (exerciseLog.exerciseId !== input.exerciseId) {
        return exerciseLog;
      }

      return {
        ...exerciseLog,
        sets: exerciseLog.sets.map((set) => {
          if (set.setNumber !== input.setNumber) {
            return set;
          }

          return {
            ...set,
            ...(Object.hasOwn(input, 'actualWeight')
              ? { actualWeight: input.actualWeight }
              : {}),
            ...(Object.hasOwn(input, 'actualReps')
              ? { actualReps: input.actualReps }
              : {}),
            ...(Object.hasOwn(input, 'actualLeftReps')
              ? { actualLeftReps: input.actualLeftReps }
              : {}),
            ...(Object.hasOwn(input, 'actualRightReps')
              ? { actualRightReps: input.actualRightReps }
              : {}),
            ...(Object.hasOwn(input, 'actualRir')
              ? { actualRir: input.actualRir }
              : {}),
            ...(Object.hasOwn(input, 'completed')
              ? { completed: input.completed }
              : {}),
            ...(Object.hasOwn(input, 'skipped')
              ? { skipped: input.skipped }
              : {}),
          };
        }),
      };
    }),
  };
}

export function countLoggedWorkoutSets(session: WorkoutSessionLog) {
  let logged = 0;
  let total = 0;

  for (const exerciseLog of session.exerciseLogs) {
    for (const set of exerciseLog.sets) {
      total += 1;
      if (set.completed || set.skipped) {
        logged += 1;
      }
    }
  }

  return { logged, total };
}

export function finalizeWorkoutSession(
  session: WorkoutSessionLog,
): WorkoutSessionLog {
  const { logged, total } = countLoggedWorkoutSets(session);
  if (logged < total) {
    const { completedAt: _completedAt, ...rest } = session;
    return rest;
  }

  return {
    ...session,
    completedAt: session.completedAt ?? nowIso(),
  };
}
