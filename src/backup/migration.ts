import type { ThemePreference } from '../theme/tokens';
import type { WeightUnit } from '../types';
import {
  alignWorkoutsToDays,
  clampWeek,
  cloneDefaultWorkouts,
  isRecord,
  normalizeCurrentDay,
  normalizeDayConfigs,
  normalizeWeekConfigs,
  normalizeWeights,
  normalizeWorkout,
  reconcileDayConfigs,
} from './normalization';
import type {
  MigratedBackupResult,
  PearLiftRuntimeState,
  PwaBackupAny,
  PwaBackupV2,
  PwaBackupWorkout,
} from './types';

export function parseBackupJson(raw: string): PwaBackupAny {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON file.');
  }

  if (!isRecord(parsed)) {
    throw new Error('Backup root must be an object.');
  }

  if (!('version' in parsed) || typeof parsed.version !== 'number') {
    throw new Error('Missing backup version.');
  }

  if (!('data' in parsed) || !isRecord(parsed.data)) {
    throw new Error('Backup data field is missing or invalid.');
  }

  return parsed;
}

export function migrateToCurrentState(
  parsed: PwaBackupAny,
): MigratedBackupResult {
  const version = Number(parsed.version ?? 2);
  const exportedAt =
    typeof parsed.exportedAt === 'string'
      ? parsed.exportedAt
      : new Date().toISOString();
  const data = isRecord(parsed.data) ? parsed.data : {};
  const settings = isRecord(data.settings) ? data.settings : {};

  const rawWorkouts = Array.isArray(data.workouts)
    ? data.workouts.filter(isRecord)
    : cloneDefaultWorkouts();
  const normalizedWorkouts = rawWorkouts
    .map((workout) => normalizeWorkout(workout as PwaBackupWorkout))
    .map((workout) => ({
      ...workout,
      exercises: workout.exercises
        .sort((a, b) => a.position - b.position)
        .map((exercise, index) => ({ ...exercise, position: index })),
    }));

  const weekConfigs = normalizeWeekConfigs(data.weekConfigs);
  const dayConfigs = reconcileDayConfigs(
    normalizedWorkouts,
    normalizeDayConfigs(data.dayConfigs),
  );
  const workouts = alignWorkoutsToDays(normalizedWorkouts, dayConfigs);
  const userWeights = normalizeWeights(data.userWeights, workouts);

  const requestedWeek = Number(settings.currentWeek ?? 1);
  const currentWeek = clampWeek(
    Number.isFinite(requestedWeek) ? requestedWeek : 1,
    weekConfigs,
  );

  const rawCurrentDay =
    typeof settings.currentDay === 'string' ? settings.currentDay : 'push';
  const currentDay = normalizeCurrentDay(rawCurrentDay, dayConfigs);
  const restDuration = Number.isFinite(Number(settings.restDuration))
    ? Number(settings.restDuration)
    : 150;
  const requestedTheme = settings.themeMode;
  const themeMode: ThemePreference =
    requestedTheme === 'system' ||
    requestedTheme === 'light' ||
    requestedTheme === 'dark'
      ? requestedTheme
      : settings.darkMode === false
        ? 'light'
        : 'dark';
  const weightUnit: WeightUnit = settings.weightUnit === 'lb' ? 'lb' : 'kg';

  const backup: PwaBackupV2 = {
    version,
    exportedAt,
    data: {
      workouts: workouts,
      userWeights,
      weekConfigs,
      dayConfigs,
      settings: {
        currentWeek,
        currentDay,
        restDuration,
        darkMode: themeMode === 'dark',
        themeMode,
        weightUnit,
      },
    },
  };

  const runtime: PearLiftRuntimeState = {
    workouts,
    userWeights,
    weekConfigs,
    dayConfigs,
    currentWeek,
    currentDay,
    restDuration,
    themeMode,
    weightUnit,
    language: 'en',
  };

  return { backup, runtime };
}

export function parseAndMigrateBackup(jsonText: string): MigratedBackupResult {
  const parsed = parseBackupJson(jsonText);
  return migrateToCurrentState(parsed);
}
