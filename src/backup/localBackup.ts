import {
  defaultDayConfigs,
  defaultWeekConfigs,
  defaultWorkouts,
} from '../data/workouts';
import type { ThemePreference } from '../theme/tokens';
import type {
  DayConfig,
  Exercise,
  UserWeights,
  WeekConfig,
  WeightUnit,
  WorkoutSession,
} from '../types';
import type {
  ChangeSummary,
  MigratedBackupResult,
  PearLiftRuntimeState,
  PwaBackupAny,
  PwaBackupExercise,
  PwaBackupV2,
  PwaBackupWorkout,
  SettingChange,
} from './types';

const FALLBACK_DAY_ICON = 'FitnessCenter';
const LOCAL_STATE_SCHEMA_VERSION = 2;
export const LOCAL_STATE_STORAGE_KEY = `pearlift-local-backup-v${LOCAL_STATE_SCHEMA_VERSION}`;
const MAX_DAY_CONFIGS = 7;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneDefaultWorkouts() {
  return JSON.parse(JSON.stringify(defaultWorkouts)) as WorkoutSession[];
}

function normalizeExercise(
  exercise: PwaBackupExercise,
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

function normalizeWorkout(workout: PwaBackupWorkout): WorkoutSession {
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

function normalizeWeekConfigs(value: unknown): WeekConfig[] {
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

function normalizeDayConfigs(value: unknown): DayConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  const valid = value
    .filter(isRecord)
    .map((day, index) => ({
      id:
        typeof day.id === 'string' && day.id.length > 0
          ? day.id
          : `day-${index + 1}`,
      name:
        typeof day.name === 'string' && day.name.length > 0
          ? day.name
          : `Day ${index + 1}`,
      icon:
        typeof day.icon === 'string' && day.icon.length > 0
          ? day.icon
          : FALLBACK_DAY_ICON,
    }))
    .slice(0, MAX_DAY_CONFIGS);

  return valid;
}

function deriveDayConfigFromWorkout(
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

function reconcileDayConfigs(
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

function alignWorkoutsToDays(
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

function normalizeWeights(
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

function clampWeek(currentWeek: number, weekConfigs: WeekConfig[]) {
  const weekIds = weekConfigs.map((week) => week.id);
  if (weekIds.length === 0) return 1;
  if (weekIds.includes(currentWeek)) return currentWeek;
  return weekIds[0] ?? 1;
}

function normalizeCurrentDay(currentDay: string, dayConfigs: DayConfig[]) {
  if (dayConfigs.some((day) => day.id === currentDay)) {
    return currentDay;
  }
  return dayConfigs[0]?.id ?? 'push';
}

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

export function toPwaBackupV2(state: PearLiftRuntimeState): PwaBackupV2 {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      workouts: state.workouts.map((workout) => ({
        ...workout,
        exercises: workout.exercises.map((exercise, index) => ({
          ...exercise,
          notes: exercise.notes ?? '',
          position: Number.isFinite(Number(exercise.position))
            ? exercise.position
            : index,
        })),
      })),
      userWeights: state.userWeights,
      weekConfigs: state.weekConfigs,
      dayConfigs: state.dayConfigs,
      settings: {
        currentWeek: state.currentWeek,
        currentDay: state.currentDay,
        restDuration: state.restDuration,
        darkMode: state.themeMode === 'dark',
        themeMode: state.themeMode,
        weightUnit: state.weightUnit,
      },
    },
  };
}

export function serializePwaBackupV2(state: PearLiftRuntimeState): string {
  return JSON.stringify(toPwaBackupV2(state), null, 2);
}

function serializeExerciseForDiff(exercise: Exercise, weight: number) {
  return [
    exercise.name,
    exercise.sets,
    exercise.reps,
    exercise.baseWeight,
    exercise.muscleGroup,
    exercise.notes,
    weight,
  ].join('|');
}

function getWorkoutMap(workouts: PwaBackupV2['data']['workouts']) {
  return new Map(workouts.map((workout) => [workout.id, workout]));
}

function buildSettingDiff(
  current: PwaBackupV2,
  incoming: PwaBackupV2,
): SettingChange[] {
  const changes: SettingChange[] = [];
  const a = current.data.settings;
  const b = incoming.data.settings;

  if (a.currentWeek !== b.currentWeek) {
    changes.push({
      key: 'Current Week',
      from: String(a.currentWeek),
      to: String(b.currentWeek),
    });
  }

  if ((a.currentDay ?? '') !== (b.currentDay ?? '')) {
    changes.push({
      key: 'Current Day',
      from: a.currentDay ?? '-',
      to: b.currentDay ?? '-',
    });
  }

  if (a.restDuration !== b.restDuration) {
    changes.push({
      key: 'Rest Duration',
      from: `${a.restDuration}s`,
      to: `${b.restDuration}s`,
    });
  }

  const aTheme = a.themeMode ?? (a.darkMode ? 'dark' : 'light');
  const bTheme = b.themeMode ?? (b.darkMode ? 'dark' : 'light');
  if (aTheme !== bTheme) {
    const label = (value: typeof aTheme) => {
      if (value === 'system') return 'System';
      return value === 'dark' ? 'Dark' : 'Light';
    };
    changes.push({
      key: 'Theme',
      from: label(aTheme),
      to: label(bTheme),
    });
  }

  const aUnit = a.weightUnit ?? 'kg';
  const bUnit = b.weightUnit ?? 'kg';
  if (aUnit !== bUnit) {
    changes.push({
      key: 'Weight Unit',
      from: aUnit.toUpperCase(),
      to: bUnit.toUpperCase(),
    });
  }

  return changes;
}

function formatWeekConfig(value: WeekConfig) {
  const loadPct = Math.round((value.loadModifier - 1) * 100);
  const loadLabel =
    loadPct === 0 ? '0%' : loadPct > 0 ? `+${loadPct}%` : `${loadPct}%`;
  return `${value.name} (RIR ${value.rir}, Load ${loadLabel})`;
}

function buildWeekConfigDiff(
  current: PwaBackupV2,
  incoming: PwaBackupV2,
): SettingChange[] {
  const a = current.data.weekConfigs ?? [];
  const b = incoming.data.weekConfigs ?? [];

  const aMap = new Map(a.map((item) => [item.id, item]));
  const bMap = new Map(b.map((item) => [item.id, item]));
  const ids = new Set([...aMap.keys(), ...bMap.keys()]);

  const changes: SettingChange[] = [];
  for (const id of [...ids].sort((x, y) => x - y)) {
    const from = aMap.get(id);
    const to = bMap.get(id);
    const key = `Week ${id}`;
    if (!from && to) {
      changes.push({ key, from: '-', to: formatWeekConfig(to) });
      continue;
    }
    if (from && !to) {
      changes.push({ key, from: formatWeekConfig(from), to: '-' });
      continue;
    }
    if (!from || !to) continue;
    if (
      from.name !== to.name ||
      from.rir !== to.rir ||
      from.loadModifier !== to.loadModifier
    ) {
      changes.push({
        key,
        from: formatWeekConfig(from),
        to: formatWeekConfig(to),
      });
    }
  }

  return changes;
}

function formatDayConfig(value: DayConfig) {
  return `${value.name} (${value.id}, ${value.icon})`;
}

function buildDayConfigDiff(
  current: PwaBackupV2,
  incoming: PwaBackupV2,
): SettingChange[] {
  const a = current.data.dayConfigs ?? [];
  const b = incoming.data.dayConfigs ?? [];

  const aMap = new Map(a.map((item) => [item.id, item]));
  const bMap = new Map(b.map((item) => [item.id, item]));
  const ids = new Set([...aMap.keys(), ...bMap.keys()]);

  const changes: SettingChange[] = [];
  for (const id of [...ids].sort()) {
    const from = aMap.get(id);
    const to = bMap.get(id);
    const key = `Day ${id}`;
    if (!from && to) {
      changes.push({ key, from: '-', to: formatDayConfig(to) });
      continue;
    }
    if (from && !to) {
      changes.push({ key, from: formatDayConfig(from), to: '-' });
      continue;
    }
    if (!from || !to) continue;
    if (from.name !== to.name || from.icon !== to.icon) {
      changes.push({
        key,
        from: formatDayConfig(from),
        to: formatDayConfig(to),
      });
    }
  }

  return changes;
}

export function computeImportDiff(
  current: PwaBackupV2,
  incoming: PwaBackupV2,
): ChangeSummary {
  const changes: ChangeSummary = {
    workouts: [],
    settings: [],
    weekConfigs: [],
    dayConfigs: [],
    totalChanges: 0,
  };

  const currentMap = getWorkoutMap(current.data.workouts);
  const incomingMap = getWorkoutMap(incoming.data.workouts);
  const workoutIds = new Set([...currentMap.keys(), ...incomingMap.keys()]);

  for (const workoutId of workoutIds) {
    const currentWorkout = currentMap.get(workoutId);
    const incomingWorkout = incomingMap.get(workoutId);

    if (!currentWorkout && incomingWorkout) {
      const added = incomingWorkout.exercises.length;
      changes.workouts.push({
        workoutId: incomingWorkout.id,
        name: incomingWorkout.name,
        added,
        removed: 0,
        modified: 0,
      });
      changes.totalChanges += added || 1;
      continue;
    }

    if (currentWorkout && !incomingWorkout) {
      const removed = currentWorkout.exercises.length;
      changes.workouts.push({
        workoutId: currentWorkout.id,
        name: currentWorkout.name,
        added: 0,
        removed,
        modified: 0,
      });
      changes.totalChanges += removed || 1;
      continue;
    }

    if (!currentWorkout || !incomingWorkout) continue;

    const currentExercises = new Map(
      currentWorkout.exercises.map((exercise, index) => {
        const weight = current.data.userWeights[exercise.id] ?? 0;
        const normalized = normalizeExercise(exercise, index);
        return [exercise.id, serializeExerciseForDiff(normalized, weight)];
      }),
    );
    const incomingExercises = new Map(
      incomingWorkout.exercises.map((exercise, index) => {
        const weight = incoming.data.userWeights[exercise.id] ?? 0;
        const normalized = normalizeExercise(exercise, index);
        return [exercise.id, serializeExerciseForDiff(normalized, weight)];
      }),
    );

    let added = 0;
    let removed = 0;
    let modified = 0;
    const exerciseIds = new Set([
      ...currentExercises.keys(),
      ...incomingExercises.keys(),
    ]);

    for (const id of exerciseIds) {
      const a = currentExercises.get(id);
      const b = incomingExercises.get(id);
      if (!a && b) added += 1;
      else if (a && !b) removed += 1;
      else if (a && b && a !== b) modified += 1;
    }

    if (added > 0 || removed > 0 || modified > 0) {
      changes.workouts.push({
        workoutId: incomingWorkout.id,
        name: incomingWorkout.name,
        added,
        removed,
        modified,
      });
      changes.totalChanges += added + removed + modified;
    }
  }

  changes.settings = buildSettingDiff(current, incoming);
  changes.totalChanges += changes.settings.length;

  changes.weekConfigs = buildWeekConfigDiff(current, incoming);
  changes.totalChanges += changes.weekConfigs.length;

  changes.dayConfigs = buildDayConfigDiff(current, incoming);
  changes.totalChanges += changes.dayConfigs.length;

  return changes;
}

export function getBackupFileName(date = new Date()) {
  const day = date.toISOString().split('T')[0];
  const hour = date
    .toISOString()
    .split('T')[1]
    .split(':')
    .slice(0, 2)
    .join('-');
  return `pearlift_backup_${day}-${hour}.json`;
}
