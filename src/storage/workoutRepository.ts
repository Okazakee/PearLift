import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { alignWorkoutsToDays } from '@/backup/normalization';
import type { PearLiftRuntimeState } from '@/backup/types';
import { MAX_DAY_CONFIGS } from '@/config/constants';
import {
  buildInitialWeights,
  defaultDayConfigs,
  defaultWeekConfigs,
  defaultWorkouts,
} from '@/data/workouts';
import { getDatabase } from '@/storage/database';
import type {
  MutationContext,
  PairedDevice,
  SyncConflictSummary,
  SyncDataSummary,
  SyncFirstSyncResolution,
  SyncRole,
  SyncRoomBindingState,
  SyncStateRow,
  WorkoutMutation,
  WorkoutStoreSnapshot,
} from '@/storage/types';
import type { SyncDeviceProfile, SyncMutation } from '@/sync/types';
import type {
  DayConfig,
  Exercise,
  UserWeights,
  WeightUnit,
  WorkoutSession,
} from '@/types';
import { roundToPrecision } from '@/utils/math';

const WEEK_CONFIG_REVISION_SETTING = 'syncWeekConfigsRevisionAt';
const DAY_CONFIG_REVISION_SETTING = 'syncDayConfigsRevisionAt';
const DEVICE_DISPLAY_NAME_SETTING = 'syncDeviceDisplayName';
const SYNC_APPLIED_OP_RETENTION_LIMIT = 4000;
const DEFAULT_PROGRAM_ID = 'main-program';
const DEFAULT_ROOM_ID = 'default';

function toDeviceCode(deviceId: string) {
  return deviceId.replace(/-/g, '').slice(-4).toUpperCase();
}

function buildDefaultDeviceName(deviceId: string) {
  return `PearLift device ${toDeviceCode(deviceId)}`;
}

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

function buildResetWorkoutDataState(
  current: PearLiftRuntimeState,
): PearLiftRuntimeState {
  const defaults = buildDefaultRuntimeState();
  return {
    ...defaults,
    restDuration: current.restDuration,
    themeMode: current.themeMode,
    weightUnit: current.weightUnit,
    language: current.language,
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

export const getLanguageNativeName = (code: string): string => {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  return lang?.native ?? code;
};

function normalizeDayConfigs(
  workouts: WorkoutSession[],
  dayConfigs: DayConfig[],
  options: { fallbackToDefault?: boolean } = {},
): DayConfig[] {
  const fallbackToDefault = options.fallbackToDefault ?? true;
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

  if (merged.length > 0) return merged;
  return fallbackToDefault ? defaultDayConfigs : [];
}

type ProgramDayRow = {
  id: string;
  day_label: string;
  icon: string;
  workout_name: string;
  workout_description: string;
  sort_order: number;
};

type ExerciseRow = {
  id: string;
  program_day_id: string;
  name: string;
  muscle_group: string;
  notes: string;
  sort_order: number;
};

type ExerciseTargetRow = {
  exercise_id: string;
  sets: number;
  reps: string;
  base_weight: number;
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

type AppSettingRow = {
  key: string;
  value: string;
};

type SyncDeviceRow = {
  device_id: string;
  device_code: string;
  display_name: string;
  writer_key: string | null;
  last_seen: string;
  is_hidden: number;
};

type SyncIdentityDbRow = {
  sync_enabled: number;
  device_id: string | null;
  pairing_secret_ciphertext: string | null;
  pairing_secret_iv: string | null;
  pairing_secret_tag: string | null;
  lamport_counter: number;
  last_error: string | null;
  last_synced_at: string | null;
  updated_at: string;
};

type SyncRoomStateDbRow = {
  room_id: string;
  sync_role: SyncRole | null;
  room_binding_state: SyncRoomBindingState | null;
  first_sync_resolution: SyncFirstSyncResolution | null;
  autobase_bootstrap_key: string | null;
  pending_local_summary: string | null;
  pending_remote_summary: string | null;
  pending_conflict_summary: string | null;
};

type SyncOutboxRow = {
  id: number;
  payload_json: string;
};

type SyncProfileOutboxRow = {
  id: number;
  display_name: string;
};

function parseJsonColumn<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isNewerRevision(
  incomingRevision: string | null | undefined,
  currentRevision: string | null | undefined,
) {
  if (!incomingRevision || !currentRevision) return true;
  const incomingTime = Date.parse(incomingRevision);
  const currentTime = Date.parse(currentRevision);
  if (!Number.isFinite(incomingTime) || !Number.isFinite(currentTime)) {
    return incomingRevision > currentRevision;
  }
  return incomingTime > currentTime;
}

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
      (err: unknown) => {
        console.error('[WorkoutRepository] Write queue error:', err);
        return undefined; // keep queue alive for subsequent writes
      },
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

    // Drain any pending writes so seeding always runs first.
    await this.writeQueue;
    this.initPromise = (async () => {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ total: number }>(
        'SELECT COUNT(*) as total FROM program_days WHERE deleted_at IS NULL',
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
    };
  }

  async isSetupDone(): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM user_preferences WHERE key = 'setupDone'",
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
            const exerciseExists = await db.getFirstAsync<{ id: string }>(
              'SELECT id FROM exercises WHERE id = ? AND deleted_at IS NULL',
              mutation.exerciseId,
            );
            if (!exerciseExists) {
              break;
            }
            const timestamp = nowIso();
            await db.runAsync(
              `INSERT INTO exercise_weights (exercise_id, value, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(exercise_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
              mutation.exerciseId,
              Math.max(0, roundToPrecision(mutation.value, 3)),
              timestamp,
            );
            break;
          }
          case 'adjustExerciseWeight': {
            const exerciseExists = await db.getFirstAsync<{ id: string }>(
              'SELECT id FROM exercises WHERE id = ? AND deleted_at IS NULL',
              mutation.exerciseId,
            );
            if (!exerciseExists) {
              break;
            }
            const existingWeight = await db.getFirstAsync<{ value: number }>(
              'SELECT value FROM exercise_weights WHERE exercise_id = ?',
              mutation.exerciseId,
            );
            const exerciseBase = await db.getFirstAsync<{
              base_weight: number;
            }>(
              'SELECT base_weight FROM exercise_targets WHERE exercise_id = ?',
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
              `INSERT INTO exercise_weights (exercise_id, value, updated_at)
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
                ? Math.max(...existing.map((exercise) => exercise.sort_order)) +
                  1
                : 0;
            const exerciseId = createExerciseId(mutation.exercise.name);
            const timestamp = nowIso();
            await db.runAsync(
              `INSERT INTO exercises (
              id, program_day_id, name, muscle_group, notes, sort_order, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
              exerciseId,
              mutation.workoutId,
              mutation.exercise.name,
              mutation.exercise.muscleGroup,
              mutation.exercise.notes,
              nextPosition,
              timestamp,
            );
            await db.runAsync(
              `INSERT INTO exercise_targets (exercise_id, sets, reps, base_weight, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(exercise_id) DO UPDATE SET sets = excluded.sets, reps = excluded.reps, base_weight = excluded.base_weight, updated_at = excluded.updated_at`,
              exerciseId,
              mutation.exercise.sets,
              mutation.exercise.reps,
              0,
              timestamp,
            );
            await db.runAsync(
              `INSERT INTO exercise_weights (exercise_id, value, updated_at)
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
              `SELECT id, program_day_id, name, muscle_group, notes, sort_order
             FROM exercises WHERE id = ? AND deleted_at IS NULL`,
              mutation.exerciseId,
            );
            if (!current) {
              break;
            }
            const currentTarget = await db.getFirstAsync<ExerciseTargetRow>(
              `SELECT exercise_id, sets, reps, base_weight
               FROM exercise_targets WHERE exercise_id = ?`,
              mutation.exerciseId,
            );
            const next = {
              ...current,
              name: mutation.updates.name ?? current.name,
              muscle_group:
                mutation.updates.muscleGroup ?? current.muscle_group,
              notes: mutation.updates.notes ?? current.notes,
              sort_order: mutation.updates.position ?? current.sort_order,
            };
            const timestamp = nowIso();
            await db.runAsync(
              `UPDATE exercises
             SET name = ?, muscle_group = ?, notes = ?, sort_order = ?, updated_at = ?
             WHERE id = ?`,
              next.name,
              next.muscle_group,
              next.notes,
              next.sort_order,
              timestamp,
              mutation.exerciseId,
            );
            if (
              currentTarget &&
              (mutation.updates.sets != null ||
                mutation.updates.reps != null ||
                mutation.updates.baseWeight != null)
            ) {
              await db.runAsync(
                `UPDATE exercise_targets
                 SET sets = ?, reps = ?, base_weight = ?, updated_at = ?
                 WHERE exercise_id = ?`,
                mutation.updates.sets ?? currentTarget.sets,
                mutation.updates.reps ?? currentTarget.reps,
                mutation.updates.baseWeight ?? currentTarget.base_weight,
                timestamp,
                mutation.exerciseId,
              );
            }
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
              'DELETE FROM exercise_weights WHERE exercise_id = ?',
              mutation.exerciseId,
            );
            await db.runAsync(
              'DELETE FROM exercise_targets WHERE exercise_id = ?',
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
                'UPDATE exercises SET sort_order = ?, updated_at = ? WHERE id = ?',
                position,
                timestamp,
                id,
              );
            }
            break;
          }
          case 'replaceWeekConfigs': {
            const timestamp = ctx.createdAt ?? nowIso();
            if (
              ctx.origin === 'remote' &&
              !(await this.shouldApplyConfigRevision(
                db,
                WEEK_CONFIG_REVISION_SETTING,
                timestamp,
              ))
            ) {
              break;
            }
            await db.runAsync(
              'DELETE FROM training_blocks WHERE program_id = ?',
              DEFAULT_PROGRAM_ID,
            );
            for (const [index, week] of mutation.weekConfigs.entries()) {
              await db.runAsync(
                `INSERT INTO training_blocks (id, program_id, name, load_modifier, rir, sort_order, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
                index + 1,
                DEFAULT_PROGRAM_ID,
                week.name,
                week.loadModifier,
                week.rir,
                index,
                timestamp,
              );
            }
            await this.writeSetting(
              db,
              WEEK_CONFIG_REVISION_SETTING,
              timestamp,
              timestamp,
            );
            break;
          }
          case 'replaceDayConfigs': {
            const runtime = await this.readRuntimeState(db);
            const timestamp = ctx.createdAt ?? nowIso();
            if (
              ctx.origin === 'remote' &&
              !(await this.shouldApplyConfigRevision(
                db,
                DAY_CONFIG_REVISION_SETTING,
                timestamp,
              ))
            ) {
              break;
            }
            const nextDayConfigs = normalizeDayConfigs(
              [],
              mutation.dayConfigs,
              {
                fallbackToDefault: ctx.origin !== 'remote',
              },
            );
            const alignedWorkouts = alignWorkoutsToDays(
              runtime.workouts,
              nextDayConfigs,
            );

            await this.writeSetting(
              db,
              DAY_CONFIG_REVISION_SETTING,
              timestamp,
              timestamp,
            );
            const keepDayIds = new Set(nextDayConfigs.map((day) => day.id));
            const existingDays = await db.getAllAsync<{ id: string }>(
              `SELECT id FROM program_days
               WHERE deleted_at IS NULL AND program_id = ?`,
              DEFAULT_PROGRAM_ID,
            );
            for (const day of existingDays) {
              if (keepDayIds.has(day.id)) continue;
              await db.runAsync(
                'UPDATE program_days SET deleted_at = ?, updated_at = ? WHERE id = ?',
                timestamp,
                timestamp,
                day.id,
              );
              await db.runAsync(
                'UPDATE exercises SET deleted_at = ?, updated_at = ? WHERE program_day_id = ?',
                timestamp,
                timestamp,
                day.id,
              );
            }

            for (const [index, workout] of alignedWorkouts.entries()) {
              const dayConfig = nextDayConfigs.find(
                (day) => day.id === workout.id,
              );
              await db.runAsync(
                `INSERT INTO program_days (
                  id,
                  program_id,
                  day_label,
                  icon,
                  workout_name,
                  workout_description,
                  sort_order,
                  updated_at,
                  deleted_at
                )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
               ON CONFLICT(id) DO UPDATE SET
                 program_id = excluded.program_id,
                 day_label = excluded.day_label,
                 icon = excluded.icon,
                 workout_name = excluded.workout_name,
                 workout_description = excluded.workout_description,
                 sort_order = excluded.sort_order,
                 updated_at = excluded.updated_at,
                 deleted_at = NULL`,
                workout.id,
                DEFAULT_PROGRAM_ID,
                dayConfig?.name ?? workout.name,
                dayConfig?.icon ?? 'FitnessCenter',
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
          case 'resetWorkoutData': {
            const runtime = await this.readRuntimeState(db);
            await this.replaceAllState(db, buildResetWorkoutDataState(runtime));
            break;
          }
          case 'resetAllData': {
            await this.replaceAllState(db, buildDefaultRuntimeState());
            await this.resetSyncState(db);
            await this.writeSetting(db, 'setupDone', 'false');
            break;
          }
          case 'restoreRuntimeState': {
            await this.replaceAllState(db, mutation.runtime);
            await this.resetSyncState(db);
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
          await this.writeSyncStatePatch(db, {
            lastSyncedAt: nowIso(),
            lastError: null,
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
    displayName?: string | null;
    writerKey?: string | null;
  }): Promise<void> {
    if (!meta.opId || !meta.deviceId) {
      throw new Error('markSyncOpApplied requires opId and deviceId.');
    }
    if (!Number.isFinite(meta.lamport) || meta.lamport < 0) {
      throw new Error('markSyncOpApplied requires non-negative lamport.');
    }
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await this.markSyncOpAppliedInDb(db, meta);
        await this.upsertSyncDeviceInDb(db, {
          deviceId: meta.deviceId,
          displayName:
            meta.displayName ?? buildDefaultDeviceName(meta.deviceId),
          writerKey: meta.writerKey ?? null,
          lastSeen: nowIso(),
          isHidden: false,
        });
        await this.writeSyncStatePatch(db, {
          lastSyncedAt: nowIso(),
          lastError: null,
        });
      });
    });
  }

  async getPairedDevices(): Promise<PairedDevice[]> {
    await this.initialize();
    const db = await getDatabase();
    const rows = await db.getAllAsync<SyncDeviceRow>(
      `SELECT device_id, device_code, display_name, writer_key, last_seen, is_hidden
       FROM sync_devices
       WHERE is_hidden = 0
       ORDER BY last_seen DESC`,
    );
    return rows.map((row) => ({
      deviceId: row.device_id,
      deviceCode: row.device_code,
      displayName: row.display_name,
      lastSeen: row.last_seen,
      writerKey: row.writer_key,
      isHidden: row.is_hidden === 1,
    }));
  }

  async forgetDevice(deviceId: string): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await db.runAsync(
        'UPDATE sync_devices SET is_hidden = 1 WHERE device_id = ?',
        deviceId,
      );
    });
  }

  async getLocalDeviceDisplayName(): Promise<string> {
    await this.initialize();
    return this.enqueueWrite(async () => {
      const db = await getDatabase();
      const state = await this.readSyncState(db);
      const deviceId = state.deviceId ?? Crypto.randomUUID();
      if (!state.deviceId) {
        await this.writeSyncStatePatch(db, { deviceId });
      }
      const existing = await this.readSetting(db, DEVICE_DISPLAY_NAME_SETTING);
      if (existing?.trim()) {
        return existing.trim();
      }
      const fallback = buildDefaultDeviceName(deviceId);
      await this.writeSetting(db, DEVICE_DISPLAY_NAME_SETTING, fallback);
      return fallback;
    });
  }

  async setLocalDeviceDisplayName(displayName: string): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await this.writeSetting(
        db,
        DEVICE_DISPLAY_NAME_SETTING,
        displayName.trim(),
      );
    });
  }

  async setPendingDeviceProfileDisplayName(
    displayName: string | null,
  ): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      const normalized = displayName?.trim() ?? '';
      await db.runAsync('DELETE FROM sync_profile_outbox');
      if (normalized) {
        await db.runAsync(
          `INSERT INTO sync_profile_outbox (
             room_id,
             display_name,
             status,
             created_at,
             updated_at
           )
           VALUES (?, ?, 'pending', ?, ?)`,
          DEFAULT_ROOM_ID,
          normalized,
          nowIso(),
          nowIso(),
        );
      }
    });
  }

  async getPendingDeviceProfileDisplayName(): Promise<string | null> {
    await this.initialize();
    const db = await getDatabase();
    const row = await db.getFirstAsync<SyncProfileOutboxRow>(
      `SELECT id, display_name
       FROM sync_profile_outbox
       WHERE room_id = ? AND status = 'pending'
       ORDER BY id ASC
       LIMIT 1`,
      DEFAULT_ROOM_ID,
    );
    if (row?.display_name?.trim()) {
      return row.display_name.trim();
    }
    return null;
  }

  async clearPendingDeviceProfileDisplayName(): Promise<void> {
    await this.setPendingDeviceProfileDisplayName(null);
  }

  async queuePendingLocalSyncMutation(mutation: SyncMutation): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      const state = await this.readSyncState(db);
      if (!state.syncEnabled) {
        return;
      }
      await db.runAsync(
        `INSERT INTO sync_outbox (
           room_id,
           payload_json,
           status,
           created_at,
           updated_at
         )
         VALUES (?, ?, 'pending', ?, ?)`,
        DEFAULT_ROOM_ID,
        JSON.stringify(mutation),
        nowIso(),
        nowIso(),
      );
    });
  }

  async getPendingLocalSyncMutations(): Promise<SyncMutation[]> {
    await this.initialize();
    const db = await getDatabase();
    const rows = await db.getAllAsync<SyncOutboxRow>(
      `SELECT id, payload_json
       FROM sync_outbox
       WHERE room_id = ? AND status = 'pending'
       ORDER BY id ASC`,
      DEFAULT_ROOM_ID,
    );
    return rows
      .map((row) => {
        try {
          return JSON.parse(row.payload_json) as SyncMutation;
        } catch {
          return null;
        }
      })
      .filter((mutation): mutation is SyncMutation => mutation != null);
  }

  async clearPendingLocalSyncMutations(): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await db.runAsync(
        'DELETE FROM sync_outbox WHERE room_id = ?',
        DEFAULT_ROOM_ID,
      );
    });
  }

  async pruneAppliedSyncOps(limit = SYNC_APPLIED_OP_RETENTION_LIMIT) {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await db.runAsync(
        `DELETE FROM sync_applied_ops
         WHERE room_id = ?
           AND op_id IN (
           SELECT op_id FROM sync_applied_ops
           WHERE room_id = ?
           ORDER BY applied_at DESC, op_id DESC
           LIMIT -1 OFFSET ?
         )`,
        DEFAULT_ROOM_ID,
        DEFAULT_ROOM_ID,
        limit,
      );
    });
  }

  async clearSyncPeerHistory(): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM sync_applied_ops');
        await db.runAsync('DELETE FROM sync_devices');
        await db.runAsync(
          'DELETE FROM sync_outbox WHERE room_id = ?',
          DEFAULT_ROOM_ID,
        );
        await db.runAsync(
          'DELETE FROM sync_profile_outbox WHERE room_id = ?',
          DEFAULT_ROOM_ID,
        );
        await this.writeSyncStatePatch(db, {
          autobaseBootstrapKey: null,
          syncRole: null,
          roomBindingState: 'unconfigured',
          firstSyncResolution: 'unknown',
          pendingLocalSummary: null,
          pendingRemoteSummary: null,
          pendingConflictSummary: null,
          lastError: null,
          lastSyncedAt: null,
        });
      });
    });
  }

  async leaveSyncRoom(): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM sync_applied_ops');
        await db.runAsync('DELETE FROM sync_devices');
        await db.runAsync(
          'DELETE FROM sync_outbox WHERE room_id = ?',
          DEFAULT_ROOM_ID,
        );
        await db.runAsync(
          'DELETE FROM sync_profile_outbox WHERE room_id = ?',
          DEFAULT_ROOM_ID,
        );
        await this.writeSyncStatePatch(db, {
          syncEnabled: false,
          autobaseBootstrapKey: null,
          syncRole: null,
          roomBindingState: 'unconfigured',
          firstSyncResolution: 'unknown',
          pendingLocalSummary: null,
          pendingRemoteSummary: null,
          pendingConflictSummary: null,
          lastError: null,
          lastSyncedAt: null,
        });
      });
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
      await this.writeSetting(
        db,
        DEVICE_DISPLAY_NAME_SETTING,
        buildDefaultDeviceName(deviceId),
      );
      return deviceId;
    });
  }

  async upsertSyncedDevice(
    profile: SyncDeviceProfile & { lastSeen?: string | null },
  ) {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await this.upsertSyncDeviceInDb(db, {
        deviceId: profile.deviceId,
        displayName: profile.displayName,
        writerKey: profile.writerKey ?? null,
        lastSeen: profile.lastSeen ?? nowIso(),
        isHidden: false,
      });
    });
  }

  private async resetSyncState(db: SQLiteDatabase) {
    await db.runAsync('DELETE FROM sync_applied_ops');
    await db.runAsync('DELETE FROM sync_devices');
    await db.runAsync(
      'DELETE FROM sync_outbox WHERE room_id = ?',
      DEFAULT_ROOM_ID,
    );
    await db.runAsync(
      'DELETE FROM sync_profile_outbox WHERE room_id = ?',
      DEFAULT_ROOM_ID,
    );
    await this.writeSyncStatePatch(db, {
      syncEnabled: false,
      deviceId: null,
      pairingSecretCiphertext: null,
      pairingSecretIv: null,
      pairingSecretTag: null,
      autobaseBootstrapKey: null,
      lamportCounter: 0,
      syncRole: null,
      roomBindingState: 'unconfigured',
      firstSyncResolution: 'unknown',
      pendingLocalSummary: null,
      pendingRemoteSummary: null,
      pendingConflictSummary: null,
      lastError: null,
      lastSyncedAt: null,
    });
  }

  private async seedInitialState(db: SQLiteDatabase) {
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
      DELETE FROM exercise_weights;
      DELETE FROM exercise_targets;
      DELETE FROM exercises;
      DELETE FROM training_blocks;
      DELETE FROM program_days;
      DELETE FROM programs;
      DELETE FROM user_preferences;
    `);

    await db.runAsync(
      `INSERT INTO programs (
          id,
          name,
          description,
          is_active,
          sort_order,
          updated_at,
          deleted_at
        ) VALUES (?, ?, ?, 1, 0, ?, NULL)`,
      DEFAULT_PROGRAM_ID,
      'Main Program',
      'Primary training program',
      timestamp,
    );

    for (const [index, workout] of alignedWorkouts.entries()) {
      const dayConfig =
        normalizedDayConfigs.find((day) => day.id === workout.id) ?? null;
      await db.runAsync(
        `INSERT INTO program_days (
            id,
            program_id,
            day_label,
            icon,
            workout_name,
            workout_description,
            sort_order,
            updated_at,
            deleted_at
          )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        workout.id,
        DEFAULT_PROGRAM_ID,
        dayConfig?.name ?? workout.name,
        dayConfig?.icon ?? 'FitnessCenter',
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
              id, program_day_id, name, muscle_group, notes, sort_order, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
          exercise.id,
          workout.id,
          exercise.name,
          exercise.muscleGroup,
          exercise.notes,
          position,
          timestamp,
        );
        await db.runAsync(
          `INSERT INTO exercise_targets (
              exercise_id,
              sets,
              reps,
              base_weight,
              updated_at
            ) VALUES (?, ?, ?, ?, ?)`,
          exercise.id,
          exercise.sets,
          exercise.reps,
          exercise.baseWeight,
          timestamp,
        );
        await db.runAsync(
          `INSERT INTO exercise_weights (exercise_id, value, updated_at)
             VALUES (?, ?, ?)`,
          exercise.id,
          runtime.userWeights[exercise.id] ?? exercise.baseWeight ?? 0,
          timestamp,
        );
      }
    }

    for (const [index, week] of runtime.weekConfigs.entries()) {
      await db.runAsync(
        `INSERT INTO training_blocks (
            id,
            program_id,
            name,
            load_modifier,
            rir,
            sort_order,
            updated_at,
            deleted_at
          )
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        week.id,
        DEFAULT_PROGRAM_ID,
        week.name,
        week.loadModifier,
        week.rir,
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
    await this.writeSetting(db, 'language', runtime.language, timestamp);
  }

  private async readRuntimeState(
    dbArg?: SQLiteDatabase,
  ): Promise<PearLiftRuntimeState> {
    const db = dbArg ?? (await getDatabase());
    const workouts = await db.getAllAsync<ProgramDayRow>(
      `SELECT
         id,
         day_label,
         icon,
         workout_name,
         workout_description,
         sort_order
       FROM program_days
       WHERE deleted_at IS NULL
       ORDER BY sort_order ASC`,
    );
    const exercises = await db.getAllAsync<ExerciseRow>(
      `SELECT id, program_day_id, name, muscle_group, notes, sort_order
       FROM exercises
       WHERE deleted_at IS NULL
       ORDER BY program_day_id ASC, sort_order ASC`,
    );
    const exerciseTargets = await db.getAllAsync<ExerciseTargetRow>(
      `SELECT exercise_id, sets, reps, base_weight
       FROM exercise_targets`,
    );
    const weights = await db.getAllAsync<WeightRow>(
      'SELECT exercise_id, value FROM exercise_weights',
    );
    const weekConfigs = await db.getAllAsync<WeekConfigRow>(
      `SELECT id, name, load_modifier, rir, sort_order FROM training_blocks
       WHERE deleted_at IS NULL AND program_id = ?
       ORDER BY sort_order ASC, id ASC`,
      DEFAULT_PROGRAM_ID,
    );
    const settings = await db.getAllAsync<AppSettingRow>(
      'SELECT key, value FROM user_preferences',
    );

    const targetMap = new Map(
      exerciseTargets.map((target) => [target.exercise_id, target]),
    );
    const exerciseMap = new Map<string, Exercise[]>();
    for (const exercise of exercises) {
      const target = targetMap.get(exercise.id);
      const list = exerciseMap.get(exercise.program_day_id) ?? [];
      list.push({
        id: exercise.id,
        name: exercise.name,
        sets: target?.sets ?? 2,
        reps: target?.reps ?? '8-10',
        baseWeight: target?.base_weight ?? 0,
        muscleGroup: exercise.muscle_group,
        notes: exercise.notes,
        position: exercise.sort_order,
      });
      exerciseMap.set(exercise.program_day_id, list);
    }

    const userWeights: UserWeights = {};
    for (const row of weights) {
      userWeights[row.exercise_id] = row.value;
    }

    const runtimeWorkouts = workouts.map((workout) => ({
      id: workout.id,
      name: workout.workout_name,
      description: workout.workout_description,
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
        workouts.length > 0
          ? workouts.map((day) => ({
              id: day.id,
              name: day.day_label,
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

  private async ensureSyncIdentityStateRow(db: SQLiteDatabase) {
    await db.runAsync(
      `INSERT OR IGNORE INTO sync_identity_state (
        id,
        sync_enabled,
        device_id,
        pairing_secret_ciphertext,
        pairing_secret_iv,
        pairing_secret_tag,
        lamport_counter,
        last_error,
        last_synced_at,
        updated_at
      ) VALUES (1, 0, NULL, NULL, NULL, NULL, 0, NULL, NULL, ?)`,
      nowIso(),
    );
  }

  private async ensureSyncRoomStateRow(db: SQLiteDatabase) {
    await db.runAsync(
      `INSERT OR IGNORE INTO sync_room_state (
        id,
        room_id,
        sync_role,
        room_binding_state,
        first_sync_resolution,
        autobase_bootstrap_key,
        pending_local_summary,
        pending_remote_summary,
        pending_conflict_summary,
        updated_at
      ) VALUES (1, ?, NULL, 'unconfigured', 'unknown', NULL, NULL, NULL, NULL, ?)`,
      DEFAULT_ROOM_ID,
      nowIso(),
    );
  }

  private async readSyncState(db: SQLiteDatabase): Promise<SyncStateRow> {
    await this.ensureSyncIdentityStateRow(db);
    await this.ensureSyncRoomStateRow(db);
    const identity = await db.getFirstAsync<SyncIdentityDbRow>(
      `SELECT
        sync_enabled,
        device_id,
        pairing_secret_ciphertext,
        pairing_secret_iv,
        pairing_secret_tag,
        lamport_counter,
        last_error,
        last_synced_at,
        updated_at
      FROM sync_identity_state WHERE id = 1`,
    );
    const room = await db.getFirstAsync<SyncRoomStateDbRow>(
      `SELECT
        room_id,
        sync_role,
        room_binding_state,
        first_sync_resolution,
        autobase_bootstrap_key,
        pending_local_summary,
        pending_remote_summary,
        pending_conflict_summary
      FROM sync_room_state WHERE id = 1`,
    );

    if (!identity || !room) {
      return {
        syncEnabled: false,
        deviceId: null,
        pairingSecretCiphertext: null,
        pairingSecretIv: null,
        pairingSecretTag: null,
        autobaseBootstrapKey: null,
        lamportCounter: 0,
        syncRole: null,
        roomBindingState: 'unconfigured',
        firstSyncResolution: 'unknown',
        pendingLocalSummary: null,
        pendingRemoteSummary: null,
        pendingConflictSummary: null,
        lastError: null,
        lastSyncedAt: null,
        updatedAt: nowIso(),
      };
    }

    return {
      syncEnabled: identity.sync_enabled === 1,
      deviceId: identity.device_id,
      pairingSecretCiphertext: identity.pairing_secret_ciphertext,
      pairingSecretIv: identity.pairing_secret_iv,
      pairingSecretTag: identity.pairing_secret_tag,
      autobaseBootstrapKey: room.autobase_bootstrap_key,
      lamportCounter: identity.lamport_counter,
      syncRole: room.sync_role,
      roomBindingState: room.room_binding_state ?? 'unconfigured',
      firstSyncResolution: room.first_sync_resolution ?? 'unknown',
      pendingLocalSummary: parseJsonColumn<SyncDataSummary>(
        room.pending_local_summary,
      ),
      pendingRemoteSummary: parseJsonColumn<SyncDataSummary>(
        room.pending_remote_summary,
      ),
      pendingConflictSummary: parseJsonColumn<SyncConflictSummary>(
        room.pending_conflict_summary,
      ),
      lastError: identity.last_error,
      lastSyncedAt: identity.last_synced_at,
      updatedAt: identity.updated_at,
    };
  }

  private async writeSyncStatePatch(
    db: SQLiteDatabase,
    patch: Partial<SyncStateRow>,
  ) {
    await this.ensureSyncIdentityStateRow(db);
    await this.ensureSyncRoomStateRow(db);
    const updatedAt = patch.updatedAt ?? nowIso();

    const identitySet: string[] = [];
    const identityValues: Array<string | number | null> = [];
    const roomSet: string[] = [];
    const roomValues: Array<string | number | null> = [];

    if (patch.syncEnabled != null) {
      identitySet.push('sync_enabled = ?');
      identityValues.push(patch.syncEnabled ? 1 : 0);
    }
    if (patch.deviceId !== undefined) {
      identitySet.push('device_id = ?');
      identityValues.push(patch.deviceId);
    }
    if (patch.pairingSecretCiphertext !== undefined) {
      identitySet.push('pairing_secret_ciphertext = ?');
      identityValues.push(patch.pairingSecretCiphertext);
    }
    if (patch.pairingSecretIv !== undefined) {
      identitySet.push('pairing_secret_iv = ?');
      identityValues.push(patch.pairingSecretIv);
    }
    if (patch.pairingSecretTag !== undefined) {
      identitySet.push('pairing_secret_tag = ?');
      identityValues.push(patch.pairingSecretTag);
    }
    if (patch.lamportCounter !== undefined) {
      identitySet.push('lamport_counter = ?');
      identityValues.push(patch.lamportCounter);
    }
    if (patch.lastError !== undefined) {
      identitySet.push('last_error = ?');
      identityValues.push(patch.lastError);
    }
    if (patch.lastSyncedAt !== undefined) {
      identitySet.push('last_synced_at = ?');
      identityValues.push(patch.lastSyncedAt);
    }

    if (patch.syncRole !== undefined) {
      roomSet.push('sync_role = ?');
      roomValues.push(patch.syncRole);
    }
    if (patch.roomBindingState !== undefined) {
      roomSet.push('room_binding_state = ?');
      roomValues.push(patch.roomBindingState);
    }
    if (patch.firstSyncResolution !== undefined) {
      roomSet.push('first_sync_resolution = ?');
      roomValues.push(patch.firstSyncResolution);
    }
    if (patch.autobaseBootstrapKey !== undefined) {
      roomSet.push('autobase_bootstrap_key = ?');
      roomValues.push(patch.autobaseBootstrapKey);
    }
    if (patch.pendingLocalSummary !== undefined) {
      roomSet.push('pending_local_summary = ?');
      roomValues.push(
        patch.pendingLocalSummary == null
          ? null
          : JSON.stringify(patch.pendingLocalSummary),
      );
    }
    if (patch.pendingRemoteSummary !== undefined) {
      roomSet.push('pending_remote_summary = ?');
      roomValues.push(
        patch.pendingRemoteSummary == null
          ? null
          : JSON.stringify(patch.pendingRemoteSummary),
      );
    }
    if (patch.pendingConflictSummary !== undefined) {
      roomSet.push('pending_conflict_summary = ?');
      roomValues.push(
        patch.pendingConflictSummary == null
          ? null
          : JSON.stringify(patch.pendingConflictSummary),
      );
    }

    if (identitySet.length > 0) {
      identitySet.push('updated_at = ?');
      identityValues.push(updatedAt);
      identityValues.push(1);
      await db.runAsync(
        `UPDATE sync_identity_state SET ${identitySet.join(', ')} WHERE id = ?`,
        ...identityValues,
      );
    }

    if (roomSet.length > 0) {
      roomSet.push('updated_at = ?');
      roomValues.push(updatedAt);
      roomValues.push(1);
      await db.runAsync(
        `UPDATE sync_room_state SET ${roomSet.join(', ')} WHERE id = ?`,
        ...roomValues,
      );
    }
  }

  private async hasAppliedSyncOpInDb(db: SQLiteDatabase, opId: string) {
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) as total
       FROM sync_applied_ops
       WHERE room_id = ? AND op_id = ?`,
      DEFAULT_ROOM_ID,
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
      `INSERT OR IGNORE INTO sync_applied_ops (
        room_id,
        op_id,
        device_id,
        lamport,
        applied_at
      ) VALUES (?, ?, ?, ?, ?)`,
      DEFAULT_ROOM_ID,
      meta.opId,
      meta.deviceId,
      meta.lamport,
      nowIso(),
    );
  }

  private async upsertSyncDeviceInDb(
    db: SQLiteDatabase,
    input: {
      deviceId: string;
      displayName: string;
      writerKey: string | null;
      lastSeen: string;
      isHidden: boolean;
    },
  ) {
    const displayName =
      input.displayName.trim() || buildDefaultDeviceName(input.deviceId);
    await db.runAsync(
      `INSERT INTO sync_devices (
        device_id,
        device_code,
        display_name,
        writer_key,
        last_seen,
        is_hidden,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        device_code = excluded.device_code,
        display_name = CASE
          WHEN sync_devices.is_hidden = 1 AND excluded.is_hidden = 0
            THEN COALESCE(sync_devices.display_name, excluded.display_name)
          ELSE excluded.display_name
        END,
        writer_key = COALESCE(excluded.writer_key, sync_devices.writer_key),
        last_seen = excluded.last_seen,
        is_hidden = excluded.is_hidden,
        updated_at = excluded.updated_at`,
      input.deviceId,
      toDeviceCode(input.deviceId),
      displayName,
      input.writerKey,
      input.lastSeen,
      input.isHidden ? 1 : 0,
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
      `INSERT INTO user_preferences (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      value,
      updatedAt,
    );
  }

  private async readSetting(db: SQLiteDatabase, key: string) {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM user_preferences WHERE key = ?',
      key,
    );
    return row?.value ?? null;
  }

  private async shouldApplyConfigRevision(
    db: SQLiteDatabase,
    settingKey: string,
    incomingRevision: string,
  ) {
    const currentRevision = await this.readSetting(db, settingKey);
    return isNewerRevision(incomingRevision, currentRevision);
  }

  private async getExercisesForWorkout(db: SQLiteDatabase, workoutId: string) {
    return db.getAllAsync<ExerciseRow>(
      `SELECT id, program_day_id, name, muscle_group, notes, sort_order
       FROM exercises WHERE program_day_id = ? AND deleted_at IS NULL
       ORDER BY sort_order ASC`,
      workoutId,
    );
  }

  private async reindexExercises(db: SQLiteDatabase, workoutId: string) {
    const ordered = await this.getExercisesForWorkout(db, workoutId);
    const timestamp = nowIso();
    for (const [position, exercise] of ordered.entries()) {
      await db.runAsync(
        'UPDATE exercises SET sort_order = ?, updated_at = ? WHERE id = ?',
        position,
        timestamp,
        exercise.id,
      );
    }
  }
}
