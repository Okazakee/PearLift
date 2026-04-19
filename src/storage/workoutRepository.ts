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
import type {
  DayConfig,
  Exercise,
  UserWeights,
  WorkoutSession,
} from '../types';
import { getDatabase } from './database';
import type {
  AppSetupState,
  SyncCheckpoint,
  SyncEntityType,
  SyncLogEntry,
  SyncMode,
  SyncOperation,
  WorkoutMutation,
  WorkoutStoreSnapshot,
} from './types';

const METADATA_KEYS = {
  localRevision: 'local_revision',
  lastBackupRevision: 'last_backup_revision',
  lastBackupAt: 'last_backup_at',
  lastBackupEventId: 'last_backup_event_id',
  lastRestoreAt: 'last_restore_at',
  setupCompleted: 'setup_completed',
  setupSyncMode: 'setup_sync_mode',
  setupIdentityProvisionedAt: 'setup_identity_provisioned_at',
  setupSeenRecoveryOptions: 'setup_seen_recovery_options',
  setupCompletedAt: 'setup_completed_at',
  setupRecoverySource: 'setup_recovery_source',
} as const;

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

function roundToHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function serializePayload(payload: unknown) {
  return JSON.stringify(payload);
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

function coerceSyncMode(value: string | null | undefined): SyncMode {
  if (value === 'd2d-sync') {
    return value;
  }
  return 'local-only';
}

function coerceRecoverySource(
  value: string | null | undefined,
): AppSetupState['recoverySource'] {
  if (value === 'start-fresh' || value === 'local-import') {
    return value;
  }
  return null;
}

function normalizeDayConfigs(
  workouts: WorkoutSession[],
  dayConfigs: DayConfig[],
): DayConfig[] {
  const seen = new Set<string>();
  const merged: DayConfig[] = [];

  for (const day of dayConfigs) {
    if (seen.has(day.id)) continue;
    seen.add(day.id);
    merged.push(day);
  }

  for (const workout of workouts) {
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
  const aligned = dayConfigs.map((day, index) => {
    const existing = byId.get(day.id);
    if (existing) return existing;
    return {
      id: day.id,
      name: `${day.name} Day`,
      description: `Custom session ${index + 1}`,
      exercises: [],
    };
  });

  for (const workout of workouts) {
    if (!dayConfigs.some((day) => day.id === workout.id)) {
      aligned.push(workout);
    }
  }

  return aligned;
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

type SyncMetadataRow = {
  key: string;
  value: string;
};

export class WorkoutRepository {
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly deviceId: string) {}

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
    const checkpoint = await this.getCheckpoint();
    return {
      ...runtime,
      checkpoint,
      isHydrating: false,
    };
  }

  async getRuntimeState(): Promise<PearLiftRuntimeState> {
    await this.initialize();
    return this.readRuntimeState();
  }

  async applyMutation(mutation: WorkoutMutation) {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();

      await db.withTransactionAsync(async () => {
        switch (mutation.type) {
          case 'setThemeMode': {
            await this.writeSetting(db, 'themeMode', mutation.themeMode);
            await this.recordMutation(db, 'setting', 'themeMode', 'upsert', {
              themeMode: mutation.themeMode,
            });
            break;
          }
          case 'setCurrentWeek': {
            await this.writeSetting(
              db,
              'currentWeek',
              String(Math.max(1, mutation.currentWeek)),
            );
            await this.recordMutation(db, 'setting', 'currentWeek', 'upsert', {
              currentWeek: Math.max(1, mutation.currentWeek),
            });
            break;
          }
          case 'setCurrentDay': {
            await this.writeSetting(db, 'currentDay', mutation.currentDay);
            await this.recordMutation(db, 'setting', 'currentDay', 'upsert', {
              currentDay: mutation.currentDay,
            });
            break;
          }
          case 'setRestDuration': {
            await this.writeSetting(
              db,
              'restDuration',
              String(Math.max(0, mutation.restDuration)),
            );
            await this.recordMutation(db, 'setting', 'restDuration', 'upsert', {
              restDuration: Math.max(0, mutation.restDuration),
            });
            break;
          }
          case 'setExerciseWeight': {
            const timestamp = nowIso();
            await db.runAsync(
              `INSERT INTO user_weights (exercise_id, value, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(exercise_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
              mutation.exerciseId,
              Math.max(0, roundToHalf(mutation.value)),
              timestamp,
            );
            await this.recordMutation(
              db,
              'weight',
              mutation.exerciseId,
              'upsert',
              {
                value: Math.max(0, roundToHalf(mutation.value)),
              },
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
              roundToHalf(currentWeight + mutation.delta),
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
            await this.recordMutation(
              db,
              'weight',
              mutation.exerciseId,
              'upsert',
              {
                delta: mutation.delta,
                value: nextWeight,
              },
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
            await this.recordMutation(db, 'exercise', exerciseId, 'upsert', {
              workoutId: mutation.workoutId,
              exercise: {
                ...mutation.exercise,
                id: exerciseId,
                baseWeight: 0,
                position: nextPosition,
              },
            });
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
            await this.recordMutation(
              db,
              'exercise',
              mutation.exerciseId,
              'upsert',
              {
                workoutId: mutation.workoutId,
                updates: mutation.updates,
              },
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
            await this.recordMutation(
              db,
              'exercise',
              mutation.exerciseId,
              'delete',
              {
                workoutId: mutation.workoutId,
              },
            );
            break;
          }
          case 'reorderExercise': {
            const ordered = await this.getExercisesForWorkout(
              db,
              mutation.workoutId,
            );
            const index = ordered.findIndex(
              (exercise) => exercise.id === mutation.exerciseId,
            );
            if (index === -1) {
              break;
            }
            const target = mutation.direction === 'up' ? index - 1 : index + 1;
            if (target < 0 || target >= ordered.length) {
              break;
            }
            [ordered[index], ordered[target]] = [
              ordered[target],
              ordered[index],
            ];
            const timestamp = nowIso();
            for (const [position, exercise] of ordered.entries()) {
              await db.runAsync(
                'UPDATE exercises SET position = ?, updated_at = ? WHERE id = ?',
                position,
                timestamp,
                exercise.id,
              );
            }
            await this.recordMutation(
              db,
              'exercise',
              mutation.exerciseId,
              'reorder',
              {
                workoutId: mutation.workoutId,
                direction: mutation.direction,
              },
            );
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
            await this.recordMutation(db, 'program', 'week-configs', 'upsert', {
              weekConfigs: mutation.weekConfigs.map((week, index) => ({
                ...week,
                id: index + 1,
              })),
            });
            break;
          }
          case 'replaceDayConfigs': {
            const runtime = await this.readRuntimeState(db);
            const nextDayConfigs = normalizeDayConfigs(
              runtime.workouts,
              mutation.dayConfigs,
            );
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
            await this.recordMutation(db, 'program', 'day-configs', 'upsert', {
              dayConfigs: nextDayConfigs,
            });
            break;
          }
          case 'resetAllData': {
            await this.replaceAllState(db, buildDefaultRuntimeState());
            await this.recordMutation(db, 'app', 'reset', 'reset', {
              reason: 'user-reset',
            });
            break;
          }
          case 'restoreRuntimeState': {
            await this.replaceAllState(db, mutation.runtime);
            const timestamp = nowIso();
            await this.upsertSyncMetadata(
              db,
              METADATA_KEYS.lastRestoreAt,
              timestamp,
            );
            await this.recordMutation(db, 'app', 'restore', 'restore', {
              source: mutation.source,
              restoredAt: timestamp,
            });
            break;
          }
          default: {
            const exhaustiveCheck: never = mutation;
            return exhaustiveCheck;
          }
        }
      });
    });
  }

  async setBackupCheckpoint(input: {
    lastBackupAt: string;
    lastBackupEventId: string;
    lastBackupRevision: number;
  }) {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await this.upsertSyncMetadata(
          db,
          METADATA_KEYS.lastBackupAt,
          input.lastBackupAt,
        );
        await this.upsertSyncMetadata(
          db,
          METADATA_KEYS.lastBackupEventId,
          input.lastBackupEventId,
        );
        await this.upsertSyncMetadata(
          db,
          METADATA_KEYS.lastBackupRevision,
          String(input.lastBackupRevision),
        );
      });
    });
  }

  async getPendingChangesCount() {
    await this.initialize();
    const db = await getDatabase();
    const checkpoint = await this.getCheckpoint(db);
    const row = await db.getFirstAsync<{ total: number }>(
      'SELECT COUNT(*) as total FROM sync_log WHERE snapshot_version > ?',
      checkpoint.lastBackupRevision,
    );
    return row?.total ?? 0;
  }

  async getSetupState(): Promise<AppSetupState> {
    await this.initialize();
    const db = await getDatabase();
    const metadata = await db.getAllAsync<SyncMetadataRow>(
      'SELECT key, value FROM sync_metadata',
    );
    const map = new Map(metadata.map((entry) => [entry.key, entry.value]));
    return {
      hasCompletedOnboarding: map.get(METADATA_KEYS.setupCompleted) === 'true',
      syncMode: coerceSyncMode(map.get(METADATA_KEYS.setupSyncMode)),
      identityProvisionedAt:
        map.get(METADATA_KEYS.setupIdentityProvisionedAt) ?? null,
      hasSeenRecoveryOptions:
        map.get(METADATA_KEYS.setupSeenRecoveryOptions) === 'true',
      completedAt: map.get(METADATA_KEYS.setupCompletedAt) ?? null,
      recoverySource: coerceRecoverySource(
        map.get(METADATA_KEYS.setupRecoverySource),
      ),
    };
  }

  async completeSetup(input: {
    syncMode: SyncMode;
    identityProvisionedAt: string;
    hasSeenRecoveryOptions?: boolean;
    recoverySource?: AppSetupState['recoverySource'];
  }) {
    await this.initialize();
    const timestamp = nowIso();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await this.upsertSyncMetadata(db, METADATA_KEYS.setupCompleted, 'true');
        await this.upsertSyncMetadata(
          db,
          METADATA_KEYS.setupSyncMode,
          input.syncMode,
        );
        await this.upsertSyncMetadata(
          db,
          METADATA_KEYS.setupIdentityProvisionedAt,
          input.identityProvisionedAt,
        );
        await this.upsertSyncMetadata(
          db,
          METADATA_KEYS.setupSeenRecoveryOptions,
          input.hasSeenRecoveryOptions === false ? 'false' : 'true',
        );
        await this.upsertSyncMetadata(
          db,
          METADATA_KEYS.setupRecoverySource,
          input.recoverySource ?? 'start-fresh',
        );
        await this.upsertSyncMetadata(
          db,
          METADATA_KEYS.setupCompletedAt,
          timestamp,
        );
      });
    });
  }

  async setSyncMode(syncMode: SyncMode) {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await this.upsertSyncMetadata(db, METADATA_KEYS.setupSyncMode, syncMode);
    });
  }

  private async seedInitialState(db: SQLiteDatabase) {
    const migrated = await AsyncStorage.getItem(LOCAL_STATE_STORAGE_KEY);
    if (migrated) {
      try {
        const parsed = parseAndMigrateBackup(migrated);
        await db.withTransactionAsync(async () => {
          await this.replaceAllState(db, parsed.runtime);
          await this.recordMutation(db, 'app', 'migration', 'restore', {
            source: 'async-storage',
          });
        });
        return;
      } catch {
        // Fall back to defaults if the legacy cache is invalid.
      }
    }

    await db.withTransactionAsync(async () => {
      await this.replaceAllState(db, buildDefaultRuntimeState());
      await this.recordMutation(db, 'app', 'bootstrap', 'restore', {
        source: 'default-seed',
      });
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
    };
  }

  private async getCheckpoint(dbArg?: SQLiteDatabase): Promise<SyncCheckpoint> {
    const db = dbArg ?? (await getDatabase());
    const metadata = await db.getAllAsync<SyncMetadataRow>(
      'SELECT key, value FROM sync_metadata',
    );
    const map = new Map(metadata.map((entry) => [entry.key, entry.value]));
    return {
      localRevision: parseNumber(map.get(METADATA_KEYS.localRevision), 0),
      lastBackupRevision: parseNumber(
        map.get(METADATA_KEYS.lastBackupRevision),
        0,
      ),
      lastBackupAt: map.get(METADATA_KEYS.lastBackupAt) ?? null,
      lastBackupEventId: map.get(METADATA_KEYS.lastBackupEventId) ?? null,
      lastRestoreAt: map.get(METADATA_KEYS.lastRestoreAt) ?? null,
    };
  }

  private async nextRevision(db: SQLiteDatabase) {
    const checkpoint = await this.getCheckpoint(db);
    const next = checkpoint.localRevision + 1;
    await this.upsertSyncMetadata(
      db,
      METADATA_KEYS.localRevision,
      String(next),
    );
    return next;
  }

  private async recordMutation(
    db: SQLiteDatabase,
    entityType: SyncEntityType,
    entityId: string,
    operation: SyncOperation,
    payload: Record<string, unknown>,
  ) {
    const revision = await this.nextRevision(db);
    const entry: SyncLogEntry = {
      id: Crypto.randomUUID(),
      entityType,
      entityId,
      operation,
      updatedAt: nowIso(),
      deviceId: this.deviceId,
      payload: serializePayload(payload),
      snapshotVersion: revision,
    };

    await db.runAsync(
      `INSERT INTO sync_log (
        id, entity_type, entity_id, operation,
        updated_at, device_id, payload, snapshot_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.id,
      entry.entityType,
      entry.entityId,
      entry.operation,
      entry.updatedAt,
      entry.deviceId,
      entry.payload,
      entry.snapshotVersion,
    );

    return revision;
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

  private async upsertSyncMetadata(
    db: SQLiteDatabase,
    key: string,
    value: string,
  ) {
    await db.runAsync(
      `INSERT INTO sync_metadata (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      value,
      nowIso(),
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
