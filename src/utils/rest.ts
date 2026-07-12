import type { Exercise, TrainingProgram, WorkoutSession } from '@/types';

const DEFAULT_REST_SECONDS = 150;

function normalizeRestSeconds(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value);
}

export function getRestSeconds(args: {
  exercise?: Pick<Exercise, 'advanced'> | null;
  workout?: Pick<WorkoutSession, 'defaultRestSeconds'> | null;
  program?: Pick<TrainingProgram, 'defaultRestSeconds'> | null;
  settingsRestSeconds?: number | null;
}) {
  return (
    normalizeRestSeconds(args.exercise?.advanced?.restSeconds) ??
    normalizeRestSeconds(args.workout?.defaultRestSeconds) ??
    normalizeRestSeconds(args.program?.defaultRestSeconds) ??
    normalizeRestSeconds(args.settingsRestSeconds) ??
    DEFAULT_REST_SECONDS
  );
}

export function shouldShowRestChip(args: {
  exercise?: Pick<Exercise, 'advanced'> | null;
  workout?: Pick<WorkoutSession, 'defaultRestSeconds'> | null;
  program?: Pick<TrainingProgram, 'defaultRestSeconds'> | null;
  settingsRestSeconds?: number | null;
}) {
  if (normalizeRestSeconds(args.exercise?.advanced?.restSeconds) != null) {
    return true;
  }
  if (normalizeRestSeconds(args.workout?.defaultRestSeconds) != null) {
    return true;
  }
  if (normalizeRestSeconds(args.program?.defaultRestSeconds) != null) {
    return true;
  }

  const settingsRestSeconds = normalizeRestSeconds(args.settingsRestSeconds);
  return (
    settingsRestSeconds != null && settingsRestSeconds !== DEFAULT_REST_SECONDS
  );
}
