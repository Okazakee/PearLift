import type {
  PearLiftBackupExercise,
  PearLiftBackupWorkout,
} from '@/backup/types';
import { MAX_DAY_CONFIGS } from '@/config/constants';
import {
  defaultDayConfigs,
  defaultWeekConfigs,
  defaultWorkouts,
} from '@/data/workouts';
import type {
  DayConfig,
  Exercise,
  UserWeights,
  WeekConfig,
  WorkoutSession,
} from '@/types';

export const FALLBACK_DAY_ICON = 'FitnessCenter';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function cloneDefaultWorkouts() {
  return JSON.parse(JSON.stringify(defaultWorkouts)) as WorkoutSession[];
}

export function normalizeExercise(
  exercise: PearLiftBackupExercise,
  fallbackPosition: number,
): Exercise {
  return {
    id: String(exercise.id ?? `exercise-${fallbackPosition}`),
    name: String(exercise.name ?? 'Exercise'),
    sets: Number.isFinite(Number(exercise.sets)) ? Number(exercise.sets) : 2,
    reps: String(exercise.reps ?? '8-10'),
    baseWeight: Number.isFinite(Number(exercise.baseWeight))
      ? Number(exercise.baseWeight)
      : 0,
    muscleGroup: String(exercise.muscleGroup ?? 'Full Body'),
    notes: typeof exercise.notes === 'string' ? exercise.notes : '',
    position: Number.isFinite(Number(exercise.position))
      ? Number(exercise.position)
      : fallbackPosition,
  };
}

export function normalizeWorkout(
  workout: PearLiftBackupWorkout,
): WorkoutSession {
  const rawExercises = Array.isArray(workout.exercises)
    ? workout.exercises
    : [];
  const normalizedExercises = rawExercises
    .map((exercise, index) => normalizeExercise(exercise, index))
    .sort((a, b) => a.position - b.position)
    .map((exercise, index) => ({ ...exercise, position: index }));

  return {
    id: String(workout.id ?? 'workout'),
    name: String(workout.name ?? 'Workout'),
    description: String(workout.description ?? ''),
    exercises: normalizedExercises,
  };
}

export function normalizeWeekConfigs(value: unknown): WeekConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    return defaultWeekConfigs;
  }

  const valid = value
    .filter(isRecord)
    .map((week, index) => ({
      id: Number.isFinite(Number(week.id)) ? Number(week.id) : index + 1,
      name:
        typeof week.name === 'string' && week.name.length > 0
          ? week.name
          : `Week ${index + 1}`,
      loadModifier: Number.isFinite(Number(week.loadModifier))
        ? Number(week.loadModifier)
        : 1,
      rir: Number.isFinite(Number(week.rir)) ? Number(week.rir) : 2,
    }))
    .sort((a, b) => a.id - b.id);

  return valid.length > 0 ? valid : defaultWeekConfigs;
}

export function normalizeDayConfigs(
  value: unknown,
  workouts: WorkoutSession[] = [],
  options: { fallbackToDefault?: boolean } = {},
): DayConfig[] {
  const fallbackToDefault = options.fallbackToDefault ?? false;
  const raw = Array.isArray(value) ? value : [];

  const seen = new Set<string>();
  const merged: DayConfig[] = [];

  for (const day of raw) {
    if (!isRecord(day)) continue;
    if (seen.has(String(day.id ?? ''))) continue;
    seen.add(String(day.id ?? ''));
    if (merged.length >= MAX_DAY_CONFIGS) break;
    merged.push({
      id:
        typeof day.id === 'string' && day.id.length > 0
          ? day.id
          : `day-${merged.length + 1}`,
      name:
        typeof day.name === 'string' && day.name.length > 0
          ? day.name
          : `Day ${merged.length + 1}`,
      icon:
        typeof day.icon === 'string' && day.icon.length > 0
          ? day.icon
          : FALLBACK_DAY_ICON,
    });
  }

  for (const workout of workouts) {
    if (merged.length >= MAX_DAY_CONFIGS) break;
    if (seen.has(workout.id)) continue;
    seen.add(workout.id);
    merged.push(deriveDayConfigFromWorkout(workout, merged.length));
  }

  if (merged.length > 0) return merged;
  return fallbackToDefault ? defaultDayConfigs : [];
}

export function deriveDayConfigFromWorkout(
  workout: WorkoutSession,
  fallbackIndex: number,
): DayConfig {
  return {
    id: workout.id,
    name:
      typeof workout.name === 'string' && workout.name.length > 0
        ? workout.name
        : `Day ${fallbackIndex + 1}`,
    icon: FALLBACK_DAY_ICON,
  };
}

export function reconcileDayConfigs(
  workouts: WorkoutSession[],
  dayConfigs: DayConfig[],
): DayConfig[] {
  const workoutById = new Map(workouts.map((workout) => [workout.id, workout]));
  const seen = new Set<string>();
  const merged: DayConfig[] = [];

  for (const day of dayConfigs) {
    if (seen.has(day.id)) continue;
    seen.add(day.id);
    if (merged.length >= MAX_DAY_CONFIGS) break;
    merged.push(day);
  }

  for (const [workoutId, workout] of workoutById) {
    if (merged.length >= MAX_DAY_CONFIGS) break;
    if (seen.has(workoutId)) continue;
    seen.add(workoutId);
    merged.push(deriveDayConfigFromWorkout(workout, merged.length));
  }

  return merged.length > 0 ? merged : defaultDayConfigs;
}

export function alignWorkoutsToDays(
  workouts: WorkoutSession[],
  dayConfigs: DayConfig[],
): WorkoutSession[] {
  const byId = new Map(workouts.map((workout) => [workout.id, workout]));
  return dayConfigs.slice(0, MAX_DAY_CONFIGS).map((day, index) => {
    const existing = byId.get(day.id);
    if (existing) return existing;

    return {
      id: day.id,
      name: `${day.name} Day`,
      description: `Custom session ${index + 1}`,
      exercises: [],
    };
  });
}

export function normalizeWeights(
  raw: unknown,
  workouts: WorkoutSession[],
): UserWeights {
  const source = isRecord(raw) ? raw : {};
  const weights: UserWeights = {};

  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      const value = source[exercise.id];
      weights[exercise.id] =
        typeof value === 'number' && Number.isFinite(value) ? value : 0;
    }
  }

  return weights;
}

export function clampWeek(currentWeek: number, weekConfigs: WeekConfig[]) {
  const weekIds = weekConfigs.map((week) => week.id);
  if (weekIds.length === 0) return 1;
  if (weekIds.includes(currentWeek)) return currentWeek;
  return weekIds[0] ?? 1;
}

export function normalizeCurrentDay(
  currentDay: string,
  dayConfigs: DayConfig[],
) {
  if (dayConfigs.some((day) => day.id === currentDay)) {
    return currentDay;
  }
  return dayConfigs[0]?.id ?? 'push';
}
