import type { Exercise, ExerciseWeekOverride } from '@/types';

function applyWeekOverride(
  exercise: Exercise,
  override: ExerciseWeekOverride,
): Exercise {
  const next: Exercise = {
    ...exercise,
    advanced: exercise.advanced ? { ...exercise.advanced } : undefined,
  };

  if (override.sets != null) {
    next.sets = override.sets;
  }
  if (override.reps != null) {
    next.reps = override.reps;
  }
  if (override.notes != null) {
    next.notes = override.notes;
  }
  if (override.restSeconds != null || override.rir) {
    next.advanced = next.advanced ? { ...next.advanced } : {};
    if (override.restSeconds != null) {
      next.advanced.restSeconds = override.restSeconds;
    }
    if (override.rir) {
      next.advanced.rir = override.rir;
    }
  }

  return next;
}

export function getExerciseTargetForWeek(
  exercise: Exercise,
  week: number,
): Exercise {
  const overrides = exercise.advanced?.weekOverrides;
  if (!overrides?.length || !Number.isFinite(week) || week < 1) {
    return exercise;
  }

  const applicableOverrides = [...overrides].sort((a, b) => a.week - b.week);
  let resolved = exercise;
  let didApplyOverride = false;

  for (const override of applicableOverrides) {
    if (override.week > week) {
      break;
    }
    resolved = applyWeekOverride(resolved, override);
    didApplyOverride = true;
  }

  return didApplyOverride ? resolved : exercise;
}

export function getActiveWeekOverride(
  exercise: Exercise,
  week: number,
): ExerciseWeekOverride | undefined {
  const overrides = exercise.advanced?.weekOverrides;
  if (!overrides?.length || !Number.isFinite(week) || week < 1) {
    return undefined;
  }

  return [...overrides]
    .sort((a, b) => a.week - b.week)
    .filter((override) => override.week <= week)
    .at(-1);
}
