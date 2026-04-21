import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  LOCAL_STATE_STORAGE_KEY,
  parseAndMigrateBackup,
} from '../backup/localBackup';
import type { PearLiftRuntimeState } from '../backup/types';
import {
  buildInitialWeights,
  defaultDayConfigs,
  defaultWeekConfigs,
  defaultWorkouts,
} from '../data/workouts';
import { getSystemLanguage } from '../i18n/systemLanguage';
import type {
  DayConfig,
  Exercise,
  UserWeights,
  WeightUnit,
  WorkoutSession,
} from '../types';
import { roundToPrecision } from '../utils/math';
import { getDatabase } from './database';
import type {
  MutationContext,
  PairedDevice,
  SyncStateRow,
  WorkoutMutation,
  WorkoutStoreSnapshot,
} from './types';

const MAX_DAY_CONFIGS = 7;

function cloneDefaultWorkouts() {
  return JSON.parse(JSON.stringify(defaultWorkouts)) as WorkoutSession[];
}

function buildDefaultRuntimeState(): PearLiftRuntimeState {
  const workouts = cloneDefaultWorkouts();
  return {
    workouts,
    userWeights: buildInitialWeights(workouts),
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

function nowIso() {
  return new Date().toISOString();
}

function createExerciseId(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'exercise'}-${Date.now().toString(36)}`;
}

function parseNumber(value: string | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function coerceThemeMode(
  value: string | null | undefined,
): PearLiftRuntimeState['themeMode'] {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return 'system';
}

function coerceWeightUnit(value: string | null | undefined): WeightUnit {
  return value === 'lb' ? 'lb' : 'kg';
}

export const SUPPORTED_LANGUAGES = [
  { code: 'en', native: 'English' },
  { code: 'de', native: 'Deutsch' },
  { code: 'fr', native: 'Français' },
  { code: 'es', native: 'Español' },
  { code: 'it', native: 'Italiano' },
  { code: 'pt', native: 'Português' },
  { code: 'nl', native: 'Nederlands' },
  { code: 'pl', native: 'Polski' },
  { code: 'sv', native: 'Svenska' },
  { code: 'da', native: 'Dansk' },
  { code: 'fi', native: 'Suomi' },
  { code: 'no', native: 'Norsk' },
  { code: 'cs', native: 'Čeština' },
  { code: 'hu', native: 'Magyar' },
  { code: 'ro', native: 'Română' },
  { code: 'el', native: 'Ελληνικά' },
  { code: 'bg', native: 'Български' },
  { code: 'hr', native: 'Hrvatski' },
  { code: 'sk', native: 'Slovenčina' },
  { code: 'sl', native: 'Slovenščina' },
  { code: 'et', native: 'Eesti' },
  { code: 'lv', native: 'Latviešu' },
  { code: 'lt', native: 'Lietuvių' },
  { code: 'zh', native: '中文' },
  { code: 'ar', native: 'العربية' },
  { code: 'hi', native: 'हिन्दी' },
  { code: 'ru', native: 'Русский' },
  { code: 'ja', native: '日本語' },
  { code: 'ko', native: '한국어' },
  { code: 'tr', native: 'Türkçe' },
  { code: 'vi', native: 'Tiếng Việt' },
  { code: 'th', native: 'ไทย' },
  { code: 'id', native: 'Bahasa Indonesia' },
];

function coerceLanguage(value: string | null | undefined): string {
  if (!value) return 'system';
  if (value === 'system') return 'system';
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === value);
  return lang ? value : 'system';
}

function detectOsLanguage(): string {
  try {
    return getSystemLanguage(
      SUPPORTED_LANGUAGES.map((lang) => lang.code),
      'en',
    );
  } catch {
    return 'en';
  }
}

export const getLanguageNativeName = (code: string): string => {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  return lang?.native ?? code;
};

export const resolveLanguage = (stored: string | null | undefined): string => {
  const coerced = coerceLanguage(stored);
  return coerced === 'system' ? detectOsLanguage() : coerced;
};

function normalizeDayConfigs(
  workouts: WorkoutSession[],
  dayConfigs: DayConfig[],
): DayConfig[] {
  const seen = new Set<string>();
  const merged: DayConfig[] = [];

  for (const day of dayConfigs) {
    if (seen.has(day.id)) continue;
    seen.add(day.id);
    if (merged.length >= MAX_DAY_CONFIGS) break;
    merged.push(day);
  }

  for (const workout of workouts) {
    if (merged.length >= MAX_DAY_CONFIGS) break;
    if (seen.has(workout.id)) continue;
    seen.add(workout.id);
    merged.push({
      id: workout.id,
      name: workout.name || `Day ${merged.length + 1}`,
      icon: 'FitnessCenter',
    });
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

type WorkoutRow = {
  id: string;
  name: string;
  description: string;
  sort_order: number;
};

type ExerciseRow = {
  id: string;
  workout_id: string;
  name: string;
  sets: number;
  reps: string;
  base_weight: number;
  muscle_group: string;
  notes: string;
  position: number;
};

type WeightRow = {
  exercise_id: string;
  value: number;
};

type WeekConfigRow = {
  id: number;
  name: string;
  load_modifier: number;
  rir: number;
  sort_order: number;
};

type DayConfigRow = {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
};

type AppSettingRow = {
  key: string;
  value: string;
};

type SyncStateDbRow = {
  sync_enabled: number;
  device_id: string | null;
  pairing_secret_ciphertext: string | null;
  pairing_secret_iv: string | null;
  pairing_secret_tag: string | null;
  autobase_bootstrap_key: string | null;
  lamport_counter: number;
  last_error: string | null;
  last_synced_at: string | null;
  updated_at: string;
};

export class WorkoutRepository {
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  private enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
    // expo-sqlite uses a single native connection; overlapping transactions can fail with:
    // "cannot start a transaction within a transaction".
    const run = this.writeQueue.then(fn, fn);
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ total: number }>(
        'SELECT COUNT(*) as total FROM workouts WHERE deleted_at IS NULL',
      );
      const total = row?.total ?? 0;

      if (total === 0) {
        await this.enqueueWrite(async () => this.seedInitialState(db));
      }

      this.initialized = true;
    })().finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  async getSnapshot(): Promise<WorkoutStoreSnapshot> {
    await this.initialize();
    const runtime = await this.readRuntimeState();
    const isSetupDone = await this.isSetupDone();
    return {
      ...runtime,
      isSetupDone,
      isHydrating: false,
    };
  }

  async isSetupDone(): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'setupDone'",
    );
    return row?.value === 'true';
  }

  async markSetupDone(): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await this.writeSetting(db, 'setupDone', 'true');
    });
  }

  async getRuntimeState(): Promise<PearLiftRuntimeState> {
    await this.initialize();
    return this.readRuntimeState();
  }

  async applyMutation(
    mutation: WorkoutMutation,
    ctx: MutationContext = { origin: 'local' },
  ) {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();

      if (ctx.origin === 'remote') {
        if (!ctx.opId || !ctx.deviceId || typeof ctx.lamport !== 'number') {
          throw new Error(
            'Remote mutation requires opId, deviceId, and lamport.',
          );
        }

        const alreadyApplied = await this.hasAppliedSyncOpInDb(db, ctx.opId);
        if (alreadyApplied) {
          return;
        }
      }

      await db.withTransactionAsync(async () => {
        switch (mutation.type) {
          case 'setThemeMode': {
            await this.writeSetting(db, 'themeMode', mutation.themeMode);
            break;
          }
          case 'setCurrentWeek': {
            await this.writeSetting(
              db,
              'currentWeek',
              String(Math.max(1, mutation.currentWeek)),
            );
            break;
          }
          case 'setCurrentDay': {
            await this.writeSetting(db, 'currentDay', mutation.currentDay);
            break;
          }
          case 'setRestDuration': {
            await this.writeSetting(
              db,
              'restDuration',
              String(Math.max(0, mutation.restDuration)),
            );
            break;
          }
          case 'setWeightUnit': {
            await this.writeSetting(db, 'weightUnit', mutation.weightUnit);
            break;
          }
          case 'setLanguage': {
            await this.writeSetting(db, 'language', mutation.language);
            break;
          }
          case 'setExerciseWeight': {
            const timestamp = nowIso();
            await db.runAsync(
              `INSERT INTO user_weights (exercise_id, value, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(exercise_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
              mutation.exerciseId,
              Math.max(0, roundToPrecision(mutation.value, 3)),
              timestamp,
            );
            break;
          }
          case 'adjustExerciseWeight': {
            const existingWeight = await db.getFirstAsync<{ value: number }>(
              'SELECT value FROM user_weights WHERE exercise_id = ?',
              mutation.exerciseId,
            );
            const exerciseBase = await db.getFirstAsync<{
              base_weight: number;
            }>(
              'SELECT base_weight FROM exercises WHERE id = ? AND deleted_at IS NULL',
              mutation.exerciseId,
            );
            const currentWeight =
              existingWeight?.value ?? exerciseBase?.base_weight ?? 0;
            const nextWeight = Math.max(
              0,
              roundToPrecision(currentWeight + mutation.delta, 3),
            );
            const timestamp = nowIso();
            await db.runAsync(
              `INSERT INTO user_weights (exercise_id, value, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(exercise_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
              mutation.exerciseId,
              nextWeight,
              timestamp,
            );
            break;
          }
          case 'addExercise': {
            const existing = await this.getExercisesForWorkout(
              db,
              mutation.workoutId,
            );
            const nextPosition =
              existing.length > 0
                ? Math.max(...existing.map((exercise) => exercise.position)) + 1
                : 0;
            const exerciseId = createExerciseId(mutation.exercise.name);
            const timestamp = nowIso();
            await db.runAsync(
              `INSERT INTO exercises (
              id, workout_id, name, sets, reps, base_weight,
              muscle_group, notes, position, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
              exerciseId,
              mutation.workoutId,
              mutation.exercise.name,
              mutation.exercise.sets,
              mutation.exercise.reps,
              0,
              mutation.exercise.muscleGroup,
              mutation.exercise.notes,
              nextPosition,
              timestamp,
            );
            await db.runAsync(
              `INSERT INTO user_weights (exercise_id, value, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(exercise_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
              exerciseId,
              0,
              timestamp,
            );
            break;
          }
          case 'editExercise': {
            const current = await db.getFirstAsync<ExerciseRow>(
              `SELECT id, workout_id, name, sets, reps, base_weight, muscle_group, notes, position
             FROM exercises WHERE id = ? AND deleted_at IS NULL`,
              mutation.exerciseId,
            );
            if (!current) {
              break;
            }
            const next = {
              ...current,
              name: mutation.updates.name ?? current.name,
              sets: mutation.updates.sets ?? current.sets,
              reps: mutation.updates.reps ?? current.reps,
              base_weight: mutation.updates.baseWeight ?? current.base_weight,
              muscle_group:
                mutation.updates.muscleGroup ?? current.muscle_group,
              notes: mutation.updates.notes ?? current.notes,
              position: mutation.updates.position ?? current.position,
            };
            const timestamp = nowIso();
            await db.runAsync(
              `UPDATE exercises
             SET name = ?, sets = ?, reps = ?, base_weight = ?, muscle_group = ?, notes = ?, position = ?, updated_at = ?
             WHERE id = ?`,
              next.name,
              next.sets,
              next.reps,
              next.base_weight,
              next.muscle_group,
              next.notes,
              next.position,
              timestamp,
              mutation.exerciseId,
            );
            break;
          }
          case 'deleteExercise': {
            const timestamp = nowIso();
            await db.runAsync(
              'UPDATE exercises SET deleted_at = ?, updated_at = ? WHERE id = ?',
              timestamp,
              timestamp,
              mutation.exerciseId,
            );
            await db.runAsync(
              'DELETE FROM user_weights WHERE exercise_id = ?',
              mutation.exerciseId,
            );
            await this.reindexExercises(db, mutation.workoutId);
            break;
          }
          case 'reorderExercises': {
            const ordered = await this.getExercisesForWorkout(
              db,
              mutation.workoutId,
            );
            const existingIds = new Set(ordered.map((exercise) => exercise.id));
            const nextOrder = mutation.orderedExerciseIds.filter((id) =>
              existingIds.has(id),
            );
            if (nextOrder.length !== ordered.length) {
              for (const exercise of ordered) {
                if (!nextOrder.includes(exercise.id)) {
                  nextOrder.push(exercise.id);
                }
              }
            }

            const timestamp = nowIso();
            for (const [position, id] of nextOrder.entries()) {
              await db.runAsync(
                'UPDATE exercises SET position = ?, updated_at = ? WHERE id = ?',
                position,
                timestamp,
                id,
              );
            }
            break;
          }
          case 'replaceWeekConfigs': {
            const timestamp = nowIso();
            await db.runAsync('DELETE FROM week_configs');
            for (const [index, week] of mutation.weekConfigs.entries()) {
              await db.runAsync(
                `INSERT INTO week_configs (id, name, load_modifier, rir, sort_order, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
                index + 1,
                week.name,
                week.loadModifier,
                week.rir,
                index,
                timestamp,
              );
            }
            break;
          }
          case 'replaceDayConfigs': {
            const runtime = await this.readRuntimeState(db);
            const nextDayConfigs = normalizeDayConfigs([], mutation.dayConfigs);
            const alignedWorkouts = alignWorkoutsToDays(
              runtime.workouts,
              nextDayConfigs,
            );
            const timestamp = nowIso();

            await db.runAsync('DELETE FROM day_configs');
            for (const [index, day] of nextDayConfigs.entries()) {
              await db.runAsync(
                `INSERT INTO day_configs (id, name, icon, sort_order, updated_at)
               VALUES (?, ?, ?, ?, ?)`,
                day.id,
                day.name,
                day.icon,
                index,
                timestamp,
              );
            }

            for (const [index, workout] of alignedWorkouts.entries()) {
              await db.runAsync(
                `INSERT INTO workouts (id, name, description, sort_order, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?, NULL)
               ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, sort_order = excluded.sort_order, updated_at = excluded.updated_at, deleted_at = NULL`,
                workout.id,
                workout.name,
                workout.description,
                index,
                timestamp,
              );
            }

            const nextCurrentDay = nextDayConfigs[0]?.id ?? runtime.currentDay;
            const currentDayStillExists = nextDayConfigs.some(
              (day) => day.id === runtime.currentDay,
            );
            await this.writeSetting(
              db,
              'currentDay',
              currentDayStillExists ? runtime.currentDay : nextCurrentDay,
            );
            break;
          }
          case 'resetAllData': {
            await this.replaceAllState(db, buildDefaultRuntimeState());
            await this.writeSetting(db, 'setupDone', 'false');
            break;
          }
          case 'restoreRuntimeState': {
            await this.replaceAllState(db, mutation.runtime);
            await this.writeSetting(db, 'setupDone', 'true');
            break;
          }
          default: {
            const exhaustiveCheck: never = mutation;
            return exhaustiveCheck;
          }
        }

        if (ctx.origin === 'remote' && ctx.opId && ctx.deviceId) {
          await this.markSyncOpAppliedInDb(db, {
            opId: ctx.opId,
            deviceId: ctx.deviceId,
            lamport: ctx.lamport ?? 0,
          });
        }
      });
    });
  }

  async getSyncState(): Promise<SyncStateRow> {
    await this.initialize();
    const db = await getDatabase();
    return this.readSyncState(db);
  }

  async setSyncState(patch: Partial<SyncStateRow>): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await this.writeSyncStatePatch(db, patch);
    });
  }

  async nextLamport(): Promise<number> {
    await this.initialize();
    return this.enqueueWrite(async () => {
      const db = await getDatabase();
      const state = await this.readSyncState(db);
      const next = Math.max(0, state.lamportCounter) + 1;
      await this.writeSyncStatePatch(db, { lamportCounter: next });
      return next;
    });
  }

  async hasAppliedSyncOp(opId: string): Promise<boolean> {
    await this.initialize();
    const db = await getDatabase();
    return this.hasAppliedSyncOpInDb(db, opId);
  }

  async markSyncOpApplied(meta: {
    opId: string;
    deviceId: string;
    lamport: number;
  }): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await this.markSyncOpAppliedInDb(db, meta);
    });
  }

  async getPairedDevices(): Promise<PairedDevice[]> {
    await this.initialize();
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ device_id: string; last_seen: string }>(
      'SELECT device_id, MAX(applied_at) as last_seen FROM sync_applied_ops GROUP BY device_id ORDER BY last_seen DESC',
    );
    return rows.map((row) => ({
      deviceId: row.device_id,
      lastSeen: row.last_seen,
    }));
  }

  async forgetDevice(deviceId: string): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await db.runAsync(
        'DELETE FROM sync_applied_ops WHERE device_id = ?',
        deviceId,
      );
    });
  }

  async getOrCreateDeviceId(): Promise<string> {
    await this.initialize();
    return this.enqueueWrite(async () => {
      const db = await getDatabase();
      const state = await this.readSyncState(db);
      if (state.deviceId) {
        return state.deviceId;
      }

      const deviceId = Crypto.randomUUID();
      await this.writeSyncStatePatch(db, { deviceId });
      return deviceId;
    });
  }

  private async seedInitialState(db: SQLiteDatabase) {
    const migrated = await AsyncStorage.getItem(LOCAL_STATE_STORAGE_KEY);
    if (migrated) {
      try {
        const parsed = parseAndMigrateBackup(migrated);
        await db.withTransactionAsync(async () => {
          await this.replaceAllState(db, parsed.runtime);
          await this.writeSetting(db, 'setupDone', 'true');
        });
        return;
      } catch {
        // Fall back to defaults if the legacy cache is invalid.
      }
    }

    await db.withTransactionAsync(async () => {
      await this.replaceAllState(db, buildDefaultRuntimeState());
    });
  }

  private async replaceAllState(
    db: SQLiteDatabase,
    runtime: PearLiftRuntimeState,
  ) {
    const timestamp = nowIso();
    const normalizedDayConfigs = normalizeDayConfigs(
      runtime.workouts,
      runtime.dayConfigs,
    );
    const alignedWorkouts = alignWorkoutsToDays(
      runtime.workouts,
      normalizedDayConfigs,
    );
    const safeCurrentDay = normalizedDayConfigs.some(
      (day) => day.id === runtime.currentDay,
    )
      ? runtime.currentDay
      : (normalizedDayConfigs[0]?.id ?? 'push');

    await db.execAsync(`
      DELETE FROM user_weights;
      DELETE FROM exercises;
      DELETE FROM workouts;
      DELETE FROM week_configs;
      DELETE FROM day_configs;
      DELETE FROM app_settings;
    `);

    for (const [index, workout] of alignedWorkouts.entries()) {
      await db.runAsync(
        `INSERT INTO workouts (id, name, description, sort_order, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        workout.id,
        workout.name,
        workout.description,
        index,
        timestamp,
      );

      const orderedExercises = [...workout.exercises].sort(
        (a, b) => a.position - b.position,
      );
      for (const [position, exercise] of orderedExercises.entries()) {
        await db.runAsync(
          `INSERT INTO exercises (
            id, workout_id, name, sets, reps, base_weight,
            muscle_group, notes, position, updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          exercise.id,
          workout.id,
          exercise.name,
          exercise.sets,
          exercise.reps,
          exercise.baseWeight,
          exercise.muscleGroup,
          exercise.notes,
          position,
          timestamp,
        );
        await db.runAsync(
          `INSERT INTO user_weights (exercise_id, value, updated_at)
           VALUES (?, ?, ?)`,
          exercise.id,
          runtime.userWeights[exercise.id] ?? exercise.baseWeight ?? 0,
          timestamp,
        );
      }
    }

    for (const [index, week] of runtime.weekConfigs.entries()) {
      await db.runAsync(
        `INSERT INTO week_configs (id, name, load_modifier, rir, sort_order, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        week.id,
        week.name,
        week.loadModifier,
        week.rir,
        index,
        timestamp,
      );
    }

    for (const [index, day] of normalizedDayConfigs.entries()) {
      await db.runAsync(
        `INSERT INTO day_configs (id, name, icon, sort_order, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        day.id,
        day.name,
        day.icon,
        index,
        timestamp,
      );
    }

    await this.writeSetting(
      db,
      'currentWeek',
      String(runtime.currentWeek),
      timestamp,
    );
    await this.writeSetting(db, 'currentDay', safeCurrentDay, timestamp);
    await this.writeSetting(
      db,
      'restDuration',
      String(Math.max(0, runtime.restDuration)),
      timestamp,
    );
    await this.writeSetting(db, 'themeMode', runtime.themeMode, timestamp);
    await this.writeSetting(
      db,
      'weightUnit',
      runtime.weightUnit ?? 'kg',
      timestamp,
    );
  }

  private async readRuntimeState(
    dbArg?: SQLiteDatabase,
  ): Promise<PearLiftRuntimeState> {
    const db = dbArg ?? (await getDatabase());
    const workouts = await db.getAllAsync<WorkoutRow>(
      `SELECT id, name, description, sort_order FROM workouts
       WHERE deleted_at IS NULL ORDER BY sort_order ASC`,
    );
    const exercises = await db.getAllAsync<ExerciseRow>(
      `SELECT id, workout_id, name, sets, reps, base_weight, muscle_group, notes, position
       FROM exercises WHERE deleted_at IS NULL ORDER BY workout_id ASC, position ASC`,
    );
    const weights = await db.getAllAsync<WeightRow>(
      'SELECT exercise_id, value FROM user_weights',
    );
    const weekConfigs = await db.getAllAsync<WeekConfigRow>(
      `SELECT id, name, load_modifier, rir, sort_order FROM week_configs
       ORDER BY sort_order ASC, id ASC`,
    );
    const dayConfigs = await db.getAllAsync<DayConfigRow>(
      `SELECT id, name, icon, sort_order FROM day_configs
       ORDER BY sort_order ASC`,
    );
    const settings = await db.getAllAsync<AppSettingRow>(
      'SELECT key, value FROM app_settings',
    );

    const exerciseMap = new Map<string, Exercise[]>();
    for (const exercise of exercises) {
      const list = exerciseMap.get(exercise.workout_id) ?? [];
      list.push({
        id: exercise.id,
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps,
        baseWeight: exercise.base_weight,
        muscleGroup: exercise.muscle_group,
        notes: exercise.notes,
        position: exercise.position,
      });
      exerciseMap.set(exercise.workout_id, list);
    }

    const userWeights: UserWeights = {};
    for (const row of weights) {
      userWeights[row.exercise_id] = row.value;
    }

    const runtimeWorkouts = workouts.map((workout) => ({
      id: workout.id,
      name: workout.name,
      description: workout.description,
      exercises: (exerciseMap.get(workout.id) ?? []).sort(
        (a, b) => a.position - b.position,
      ),
    }));

    const settingsMap = new Map(
      settings.map((entry) => [entry.key, entry.value]),
    );

    return {
      workouts:
        runtimeWorkouts.length > 0 ? runtimeWorkouts : cloneDefaultWorkouts(),
      userWeights,
      weekConfigs:
        weekConfigs.length > 0
          ? weekConfigs.map((week) => ({
              id: week.id,
              name: week.name,
              loadModifier: week.load_modifier,
              rir: week.rir,
            }))
          : defaultWeekConfigs,
      dayConfigs:
        dayConfigs.length > 0
          ? dayConfigs.map((day) => ({
              id: day.id,
              name: day.name,
              icon: day.icon,
            }))
          : defaultDayConfigs,
      currentWeek: parseNumber(settingsMap.get('currentWeek'), 1),
      currentDay:
        settingsMap.get('currentDay') ?? defaultDayConfigs[0]?.id ?? 'push',
      restDuration: parseNumber(settingsMap.get('restDuration'), 150),
      themeMode: coerceThemeMode(settingsMap.get('themeMode')),
      weightUnit: coerceWeightUnit(settingsMap.get('weightUnit')),
      language: coerceLanguage(settingsMap.get('language')),
    };
  }

  private async ensureSyncStateRow(db: SQLiteDatabase) {
    const row = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM sync_state WHERE id = 1',
    );
    if (row?.id === 1) {
      return;
    }

    await db.runAsync(
      `INSERT INTO sync_state (
        id,
        sync_enabled,
        device_id,
        pairing_secret_ciphertext,
        pairing_secret_iv,
        pairing_secret_tag,
        autobase_bootstrap_key,
        lamport_counter,
        last_error,
        last_synced_at,
        updated_at
      ) VALUES (1, 0, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, ?)`,
      nowIso(),
    );
  }

  private async readSyncState(db: SQLiteDatabase): Promise<SyncStateRow> {
    await this.ensureSyncStateRow(db);
    const row = await db.getFirstAsync<SyncStateDbRow>(
      `SELECT
        sync_enabled,
        device_id,
        pairing_secret_ciphertext,
        pairing_secret_iv,
        pairing_secret_tag,
        autobase_bootstrap_key,
        lamport_counter,
        last_error,
        last_synced_at,
        updated_at
      FROM sync_state WHERE id = 1`,
    );

    if (!row) {
      const now = nowIso();
      return {
        syncEnabled: false,
        deviceId: null,
        pairingSecretCiphertext: null,
        pairingSecretIv: null,
        pairingSecretTag: null,
        autobaseBootstrapKey: null,
        lamportCounter: 0,
        lastError: null,
        lastSyncedAt: null,
        updatedAt: now,
      };
    }

    return {
      syncEnabled: row.sync_enabled === 1,
      deviceId: row.device_id,
      pairingSecretCiphertext: row.pairing_secret_ciphertext,
      pairingSecretIv: row.pairing_secret_iv,
      pairingSecretTag: row.pairing_secret_tag,
      autobaseBootstrapKey: row.autobase_bootstrap_key,
      lamportCounter: row.lamport_counter,
      lastError: row.last_error,
      lastSyncedAt: row.last_synced_at,
      updatedAt: row.updated_at,
    };
  }

  private async writeSyncStatePatch(
    db: SQLiteDatabase,
    patch: Partial<SyncStateRow>,
  ) {
    await this.ensureSyncStateRow(db);

    const keys: Array<keyof SyncStateRow> = Object.keys(patch) as Array<
      keyof SyncStateRow
    >;
    if (keys.length === 0) {
      return;
    }

    const columnMap: Record<keyof SyncStateRow, string> = {
      syncEnabled: 'sync_enabled',
      deviceId: 'device_id',
      pairingSecretCiphertext: 'pairing_secret_ciphertext',
      pairingSecretIv: 'pairing_secret_iv',
      pairingSecretTag: 'pairing_secret_tag',
      autobaseBootstrapKey: 'autobase_bootstrap_key',
      lamportCounter: 'lamport_counter',
      lastError: 'last_error',
      lastSyncedAt: 'last_synced_at',
      updatedAt: 'updated_at',
    };

    const setClauses: string[] = [];
    const values: Array<number | string | null> = [];

    for (const key of keys) {
      if (key === 'updatedAt') {
        continue;
      }
      const column = columnMap[key];
      if (!column) continue;
      setClauses.push(`${column} = ?`);
      if (key === 'syncEnabled') {
        values.push(patch[key] ? 1 : 0);
      } else {
        values.push((patch[key] as string | number | null | undefined) ?? null);
      }
    }

    setClauses.push('updated_at = ?');
    values.push(patch.updatedAt ?? nowIso());
    values.push(1);

    await db.runAsync(
      `UPDATE sync_state SET ${setClauses.join(', ')} WHERE id = ?`,
      ...values,
    );
  }

  private async hasAppliedSyncOpInDb(db: SQLiteDatabase, opId: string) {
    const row = await db.getFirstAsync<{ total: number }>(
      'SELECT COUNT(*) as total FROM sync_applied_ops WHERE op_id = ?',
      opId,
    );
    return (row?.total ?? 0) > 0;
  }

  private async markSyncOpAppliedInDb(
    db: SQLiteDatabase,
    meta: {
      opId: string;
      deviceId: string;
      lamport: number;
    },
  ) {
    await db.runAsync(
      `INSERT OR IGNORE INTO sync_applied_ops (op_id, device_id, lamport, applied_at)
       VALUES (?, ?, ?, ?)`,
      meta.opId,
      meta.deviceId,
      meta.lamport,
      nowIso(),
    );
  }

  private async writeSetting(
    db: SQLiteDatabase,
    key: string,
    value: string,
    updatedAt = nowIso(),
  ) {
    await db.runAsync(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      value,
      updatedAt,
    );
  }

  private async getExercisesForWorkout(db: SQLiteDatabase, workoutId: string) {
    return db.getAllAsync<ExerciseRow>(
      `SELECT id, workout_id, name, sets, reps, base_weight, muscle_group, notes, position
       FROM exercises WHERE workout_id = ? AND deleted_at IS NULL
       ORDER BY position ASC`,
      workoutId,
    );
  }

  private async reindexExercises(db: SQLiteDatabase, workoutId: string) {
    const ordered = await this.getExercisesForWorkout(db, workoutId);
    const timestamp = nowIso();
    for (const [position, exercise] of ordered.entries()) {
      await db.runAsync(
        'UPDATE exercises SET position = ?, updated_at = ? WHERE id = ?',
        position,
        timestamp,
        exercise.id,
      );
    }
  }
}
