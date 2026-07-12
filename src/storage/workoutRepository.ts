import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { alignWorkoutsToDays } from '@/backup/normalization';
import type {
  BackupProgramCollection,
  PearLiftRuntimeState,
} from '@/backup/types';
import { defaultDayConfigs } from '@/data/workouts';
import { getDatabase } from '@/storage/database';
import {
  buildDefaultDeviceName,
  buildDefaultProgram,
  buildDefaultRuntimeState,
  buildResetWorkoutDataState,
  cloneDefaultWorkouts,
  coerceLanguage,
  coerceThemeMode,
  coerceWeightUnit,
  createExerciseId,
  DAY_CONFIG_REVISION_SETTING,
  DEFAULT_PROGRAM_ID,
  DEFAULT_ROOM_ID,
  DEVICE_DISPLAY_NAME_SETTING,
  normalizeDayConfigs,
  nowIso,
  parseNumber,
  SYNC_APPLIED_OP_RETENTION_LIMIT,
  toDeviceCode,
  WEEK_CONFIG_REVISION_SETTING,
} from '@/storage/repository/defaults';
import {
  type AppSettingRow,
  buildDayConfigSchedule,
  buildExerciseMap,
  buildTrainingProgram,
  buildUserExerciseSettings,
  buildUserWeights,
  type ExerciseRow,
  type ExerciseTargetRow,
  type ProgramDayRow,
  type ProgramRow,
  toSettingsMap,
  type UserExerciseSettingsRow,
  type WeekConfigRow,
  type WeightRow,
} from '@/storage/repository/runtimeState';
import {
  parseJsonColumn,
  type SyncDeviceRow,
  type SyncIdentityDbRow,
  type SyncOutboxRow,
  type SyncProfileOutboxRow,
  type SyncRoomStateDbRow,
} from '@/storage/repository/syncState';
import type { WorkoutRepositoryPort } from '@/storage/repository/types';
import { WriteQueue } from '@/storage/repository/writeQueue';
import type {
  MutationContext,
  PairedDevice,
  SyncConflictSummary,
  SyncDataSummary,
  SyncStateRow,
  WorkoutMutation,
  WorkoutStoreSnapshot,
} from '@/storage/types';
import type { SyncDeviceProfile, SyncMutation } from '@/sync/types';
import type {
  ExerciseAdvanced,
  ProgramSummary,
  TrainingProgram,
  UserExerciseSettings,
  WorkoutSessionLog,
} from '@/types';
import { roundToPrecision } from '@/utils/math';
import {
  buildImportedProgramId,
  remapImportedProgram,
} from '@/utils/programImport';

export { getLanguageNativeName } from '@/storage/repository/defaults';

function serializeExerciseAdvanced(advanced?: ExerciseAdvanced): string | null {
  return advanced ? JSON.stringify(advanced) : null;
}

function serializeExerciseAliases(aliases?: string[]): string | null {
  return aliases?.length ? JSON.stringify(aliases) : null;
}

function serializeFrequencySummary(program?: TrainingProgram | null) {
  return program?.frequencySummary
    ? JSON.stringify(program.frequencySummary)
    : null;
}

function serializeProgramSource(program?: TrainingProgram | null) {
  return program?.source ? JSON.stringify(program.source) : null;
}

type WorkoutSessionLogRow = {
  payload_json: string;
};

function parseWorkoutSessionLog(value: string): WorkoutSessionLog | null {
  try {
    return JSON.parse(value) as WorkoutSessionLog;
  } catch {
    // ignore malformed stored workout logs
    return null;
  }
}

class WorkoutRepositoryImpl implements WorkoutRepositoryPort {
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private readonly writeQueue = new WriteQueue();

  private enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
    return this.writeQueue.enqueue(fn);
  }

  async initialize() {
    if (this.initialized) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    // Drain any pending writes so seeding always runs first.
    await this.writeQueue.drain();
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
    const db = await getDatabase();
    const [runtime, availablePrograms, isSetupDone, currentDaySelectedAtRow] =
      await Promise.all([
        this.readRuntimeState(db),
        this.readProgramSummaries(db),
        this.isSetupDone(),
        db.getFirstAsync<{ value: string }>(
          "SELECT value FROM user_preferences WHERE key = 'currentDaySelectedAt'",
        ),
      ]);
    return {
      ...runtime,
      availablePrograms,
      isSetupDone,
      currentDaySelectedAt: currentDaySelectedAtRow?.value ?? null,
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

  async getBackupProgramCollection(): Promise<BackupProgramCollection> {
    await this.initialize();
    const db = await getDatabase();
    return this.readBackupProgramCollection(db);
  }

  async getAvailablePrograms(): Promise<ProgramSummary[]> {
    await this.initialize();
    const db = await getDatabase();
    return this.readProgramSummaries(db);
  }

  async setActiveProgram(programId: string): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        const timestamp = nowIso();
        await db.runAsync(
          `UPDATE programs
           SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END,
               updated_at = ?
           WHERE deleted_at IS NULL`,
          programId,
          timestamp,
        );
        await this.normalizeSelectedProgramState(db, programId, timestamp);
      });
    });
  }

  async importProgram(input: {
    runtime: PearLiftRuntimeState;
    sessionLogs: WorkoutSessionLog[];
    mode: 'import_as_new' | 'replace_active';
    activate?: boolean;
  }): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        if (input.mode === 'replace_active') {
          await this.replaceActiveProgramState(
            db,
            input.runtime,
            input.sessionLogs,
          );
        } else {
          await this.insertImportedProgramState(
            db,
            input.runtime,
            input.sessionLogs,
            input.activate ?? true,
          );
        }
        await this.writeSetting(db, 'setupDone', 'true');
      });
    });
  }

  async saveWorkoutSessionLog(log: WorkoutSessionLog): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      const updatedAt = nowIso();
      await db.runAsync(
        `INSERT INTO workout_session_logs (
            id,
            program_id,
            workout_id,
            workout_name_snapshot,
            started_at,
            completed_at,
            week_number,
            payload_json,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            program_id = excluded.program_id,
            workout_id = excluded.workout_id,
            workout_name_snapshot = excluded.workout_name_snapshot,
            started_at = excluded.started_at,
            completed_at = excluded.completed_at,
            week_number = excluded.week_number,
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at`,
        log.id,
        log.programId ?? null,
        log.workoutId,
        log.workoutNameSnapshot,
        log.startedAt,
        log.completedAt ?? null,
        log.weekNumber ?? null,
        JSON.stringify(log),
        updatedAt,
      );
    });
  }

  async saveUserExerciseSettings(
    settings: UserExerciseSettings,
  ): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      const updatedAt = settings.updatedAt || nowIso();

      await db.runAsync(
        `INSERT INTO user_exercise_settings (
            exercise_id,
            working_weight,
            weight_unit,
            weight_mode,
            increment_kg,
            estimated_one_rep_max,
            notes,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(exercise_id) DO UPDATE SET
            working_weight = excluded.working_weight,
            weight_unit = excluded.weight_unit,
            weight_mode = excluded.weight_mode,
            increment_kg = excluded.increment_kg,
            estimated_one_rep_max = excluded.estimated_one_rep_max,
            notes = excluded.notes,
            updated_at = excluded.updated_at`,
        settings.exerciseId,
        settings.workingWeight ?? null,
        settings.weightUnit,
        settings.weightMode,
        settings.incrementKg ?? null,
        settings.estimatedOneRepMax ?? null,
        settings.notes ?? null,
        updatedAt,
      );

      if (settings.workingWeight != null) {
        await db.runAsync(
          `INSERT INTO exercise_weights (exercise_id, value, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(exercise_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          settings.exerciseId,
          Math.max(0, roundToPrecision(settings.workingWeight, 3)),
          updatedAt,
        );
      }
    });
  }

  async getWorkoutSessionLogs(input?: {
    workoutId?: string;
    limit?: number | null;
  }): Promise<WorkoutSessionLog[]> {
    await this.initialize();
    const db = await getDatabase();
    const hasLimit = input?.limit !== null;
    const limit = Math.max(1, input?.limit ?? 50);
    const rows = input?.workoutId
      ? hasLimit
        ? await db.getAllAsync<WorkoutSessionLogRow>(
            `SELECT payload_json
             FROM workout_session_logs
             WHERE workout_id = ?
             ORDER BY COALESCE(completed_at, started_at) DESC
             LIMIT ?`,
            input.workoutId,
            limit,
          )
        : await db.getAllAsync<WorkoutSessionLogRow>(
            `SELECT payload_json
             FROM workout_session_logs
             WHERE workout_id = ?
             ORDER BY COALESCE(completed_at, started_at) DESC`,
            input.workoutId,
          )
      : hasLimit
        ? await db.getAllAsync<WorkoutSessionLogRow>(
            `SELECT payload_json
             FROM workout_session_logs
             ORDER BY COALESCE(completed_at, started_at) DESC
             LIMIT ?`,
            limit,
          )
        : await db.getAllAsync<WorkoutSessionLogRow>(
            `SELECT payload_json
             FROM workout_session_logs
             ORDER BY COALESCE(completed_at, started_at) DESC`,
          );

    return rows
      .map((row) => parseWorkoutSessionLog(row.payload_json))
      .filter((row): row is WorkoutSessionLog => row !== null);
  }

  async applyMutation(
    mutation: WorkoutMutation,
    ctx: MutationContext = { origin: 'local' },
  ) {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      if (
        ctx.origin === 'remote' &&
        (!ctx.opId || !ctx.deviceId || typeof ctx.lamport !== 'number')
      ) {
        throw new Error(
          'Remote mutation requires opId, deviceId, and lamport.',
        );
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
            const timestamp = nowIso();
            await this.writeSetting(
              db,
              'currentDay',
              mutation.currentDay,
              timestamp,
            );
            await this.writeSetting(
              db,
              'currentDaySelectedAt',
              timestamp,
              timestamp,
            );
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
          case 'setProgramMetadata': {
            const currentProgram = await db.getFirstAsync<ProgramRow>(
              `SELECT
                 id,
                 name,
                 subtitle,
                 goal,
                 description,
                 source_json,
                 start_date,
                 duration_weeks,
                 schedule_type,
                 progression_model,
                 frequency_summary_json,
                 default_rest_seconds,
                 updated_at
               FROM programs
               WHERE deleted_at IS NULL AND is_active = 1
               ORDER BY sort_order ASC
               LIMIT 1`,
            );
            if (!currentProgram) {
              break;
            }
            const timestamp = nowIso();
            const hasName = Object.hasOwn(mutation.updates, 'name');
            const hasSubtitle = Object.hasOwn(mutation.updates, 'subtitle');
            const hasGoal = Object.hasOwn(mutation.updates, 'goal');
            const hasDescription = Object.hasOwn(
              mutation.updates,
              'description',
            );
            const hasSource = Object.hasOwn(mutation.updates, 'source');
            const hasStartDate = Object.hasOwn(mutation.updates, 'startDate');
            const hasDurationWeeks = Object.hasOwn(
              mutation.updates,
              'durationWeeks',
            );
            const hasScheduleType = Object.hasOwn(
              mutation.updates,
              'scheduleType',
            );
            const hasProgressionModel = Object.hasOwn(
              mutation.updates,
              'progressionModel',
            );
            const hasFrequencySummary = Object.hasOwn(
              mutation.updates,
              'frequencySummary',
            );
            const hasDefaultRestSeconds = Object.hasOwn(
              mutation.updates,
              'defaultRestSeconds',
            );
            await db.runAsync(
              `UPDATE programs
               SET
                 name = ?,
                 subtitle = ?,
                 goal = ?,
                 description = ?,
                 source_json = ?,
                 start_date = ?,
                 duration_weeks = ?,
                 schedule_type = ?,
                 progression_model = ?,
                 frequency_summary_json = ?,
               default_rest_seconds = ?,
               updated_at = ?
               WHERE id = ?`,
              hasName
                ? (mutation.updates.name ?? currentProgram.name)
                : currentProgram.name,
              hasSubtitle
                ? (mutation.updates.subtitle ?? null)
                : currentProgram.subtitle,
              hasGoal ? (mutation.updates.goal ?? null) : currentProgram.goal,
              hasDescription
                ? (mutation.updates.description ?? null)
                : currentProgram.description,
              hasSource
                ? mutation.updates.source
                  ? JSON.stringify(mutation.updates.source)
                  : null
                : currentProgram.source_json,
              hasStartDate
                ? (mutation.updates.startDate ?? null)
                : currentProgram.start_date,
              hasDurationWeeks
                ? (mutation.updates.durationWeeks ?? null)
                : currentProgram.duration_weeks,
              hasScheduleType
                ? (mutation.updates.scheduleType ?? null)
                : currentProgram.schedule_type,
              hasProgressionModel
                ? (mutation.updates.progressionModel ?? null)
                : currentProgram.progression_model,
              hasFrequencySummary
                ? mutation.updates.frequencySummary &&
                  mutation.updates.frequencySummary.length > 0
                  ? JSON.stringify(mutation.updates.frequencySummary)
                  : null
                : currentProgram.frequency_summary_json,
              hasDefaultRestSeconds
                ? (mutation.updates.defaultRestSeconds ?? null)
                : currentProgram.default_rest_seconds,
              timestamp,
              currentProgram.id,
            );
            break;
          }
          case 'setWorkoutDefaultRest': {
            await db.runAsync(
              `UPDATE program_days
               SET
                 default_rest_seconds = ?,
                 updated_at = ?
               WHERE id = ? AND deleted_at IS NULL`,
              mutation.defaultRestSeconds ?? null,
              nowIso(),
              mutation.workoutId,
            );
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
            const exerciseId =
              mutation.exercise.id ?? createExerciseId(mutation.exercise.name);
            const timestamp = nowIso();
            await db.runAsync(
              `INSERT INTO exercises (
              id, program_day_id, canonical_exercise_id, name, aliases_json, variant_label, session_specific, muscle_group, notes, advanced_json, sort_order, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
              exerciseId,
              mutation.workoutId,
              mutation.exercise.canonicalExerciseId ?? null,
              mutation.exercise.name,
              serializeExerciseAliases(mutation.exercise.aliases),
              mutation.exercise.variantLabel ?? null,
              mutation.exercise.sessionSpecific ? 1 : 0,
              mutation.exercise.muscleGroup,
              mutation.exercise.notes,
              serializeExerciseAdvanced(mutation.exercise.advanced),
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
              `SELECT id, program_day_id, canonical_exercise_id, name, aliases_json, variant_label, session_specific, muscle_group, notes, advanced_json, sort_order
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
              canonical_exercise_id: Object.hasOwn(
                mutation.updates,
                'canonicalExerciseId',
              )
                ? (mutation.updates.canonicalExerciseId ?? null)
                : current.canonical_exercise_id,
              name: mutation.updates.name ?? current.name,
              aliases_json: Object.hasOwn(mutation.updates, 'aliases')
                ? serializeExerciseAliases(mutation.updates.aliases)
                : current.aliases_json,
              variant_label: Object.hasOwn(mutation.updates, 'variantLabel')
                ? (mutation.updates.variantLabel ?? null)
                : current.variant_label,
              session_specific: Object.hasOwn(
                mutation.updates,
                'sessionSpecific',
              )
                ? mutation.updates.sessionSpecific
                  ? 1
                  : 0
                : current.session_specific,
              muscle_group:
                mutation.updates.muscleGroup ?? current.muscle_group,
              notes: mutation.updates.notes ?? current.notes,
              advanced_json: Object.hasOwn(mutation.updates, 'advanced')
                ? serializeExerciseAdvanced(mutation.updates.advanced)
                : current.advanced_json,
              sort_order: mutation.updates.position ?? current.sort_order,
            };
            const timestamp = nowIso();
            await db.runAsync(
              `UPDATE exercises
             SET canonical_exercise_id = ?, name = ?, aliases_json = ?, variant_label = ?, session_specific = ?, muscle_group = ?, notes = ?, advanced_json = ?, sort_order = ?, updated_at = ?
             WHERE id = ?`,
              next.canonical_exercise_id,
              next.name,
              next.aliases_json,
              next.variant_label,
              next.session_specific,
              next.muscle_group,
              next.notes,
              next.advanced_json,
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
            const activeProgramId = await this.readActiveProgramId(db);
            await db.runAsync(
              'DELETE FROM training_blocks WHERE program_id = ?',
              activeProgramId,
            );
            for (const [index, week] of mutation.weekConfigs.entries()) {
              await db.runAsync(
                `INSERT INTO training_blocks (
                  program_id,
                  week_number,
                  name,
                  load_modifier,
                  volume_modifier,
                  rir,
                  notes,
                  sort_order,
                  updated_at,
                  deleted_at
                )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
                activeProgramId,
                week.id,
                week.name,
                week.loadModifier,
                week.volumeModifier ?? 1,
                week.rir,
                week.notes ?? null,
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
            const activeProgramId = runtime.program?.id ?? DEFAULT_PROGRAM_ID;
            const timestamp = ctx.createdAt ?? nowIso();
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
              activeProgramId,
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
                  session_label,
                  icon,
                  schedule_json,
                  workout_name,
                  workout_description,
                  default_rest_seconds,
                  sort_order,
                  updated_at,
                  deleted_at
                )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
               ON CONFLICT(id) DO UPDATE SET
                 program_id = excluded.program_id,
                 day_label = excluded.day_label,
                 session_label = excluded.session_label,
                 icon = excluded.icon,
                 schedule_json = excluded.schedule_json,
                 workout_name = excluded.workout_name,
                 workout_description = excluded.workout_description,
                 default_rest_seconds = excluded.default_rest_seconds,
                 sort_order = excluded.sort_order,
                 updated_at = excluded.updated_at,
                 deleted_at = NULL`,
                workout.id,
                activeProgramId,
                dayConfig?.name ?? workout.name,
                dayConfig?.sessionLabel ?? null,
                dayConfig?.icon ?? 'FitnessCenter',
                dayConfig?.schedule ? JSON.stringify(dayConfig.schedule) : null,
                workout.name,
                workout.description,
                workout.defaultRestSeconds ?? null,
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

  async replaceSyncProjection(input: {
    runtime: PearLiftRuntimeState;
    devices: Array<SyncDeviceProfile & { lastSeen: string }>;
    appliedOps: Array<{
      opId: string;
      deviceId: string;
      lamport: number;
    }>;
  }): Promise<void> {
    await this.initialize();
    await this.enqueueWrite(async () => {
      const db = await getDatabase();
      const localDeviceDisplayName = await this.readSetting(
        db,
        DEVICE_DISPLAY_NAME_SETTING,
      );
      const hiddenRows = await db.getAllAsync<{
        device_id: string;
        is_hidden: number;
      }>('SELECT device_id, is_hidden FROM sync_devices');
      const hiddenByDeviceId = new Map(
        hiddenRows.map((row) => [row.device_id, row.is_hidden === 1] as const),
      );

      await db.withTransactionAsync(async () => {
        await this.replaceAllState(db, input.runtime);
        await this.writeSetting(db, 'setupDone', 'true');
        if (localDeviceDisplayName?.trim()) {
          await this.writeSetting(
            db,
            DEVICE_DISPLAY_NAME_SETTING,
            localDeviceDisplayName.trim(),
          );
        }
        await db.runAsync('DELETE FROM sync_applied_ops');

        for (const op of input.appliedOps) {
          await this.markSyncOpAppliedInDb(db, op);
        }

        for (const device of input.devices) {
          await this.upsertSyncDeviceInDb(db, {
            deviceId: device.deviceId,
            displayName: device.displayName,
            writerKey: device.writerKey ?? null,
            lastSeen: device.lastSeen,
            isHidden: hiddenByDeviceId.get(device.deviceId) ?? false,
          });
        }

        await this.writeSyncStatePatch(db, {
          lastSyncedAt: nowIso(),
          lastError: null,
        });
      });
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

    await db.execAsync(`
      DELETE FROM user_exercise_settings;
      DELETE FROM exercise_weights;
      DELETE FROM exercise_targets;
      DELETE FROM exercises;
      DELETE FROM training_blocks;
      DELETE FROM program_days;
      DELETE FROM programs;
      DELETE FROM user_preferences;
    `);

    await this.insertProgramState(db, runtime, {
      timestamp,
      sortOrder: 0,
      isActive: true,
    });
    await this.writeRuntimePreferences(db, runtime, timestamp);
  }

  private async writeRuntimePreferences(
    db: SQLiteDatabase,
    runtime: PearLiftRuntimeState,
    timestamp: string,
  ) {
    const normalizedDayConfigs = normalizeDayConfigs(
      runtime.workouts,
      runtime.dayConfigs,
    );
    const safeCurrentDay = normalizedDayConfigs.some(
      (day) => day.id === runtime.currentDay,
    )
      ? runtime.currentDay
      : (normalizedDayConfigs[0]?.id ?? 'push');

    await this.writeSetting(
      db,
      'currentWeek',
      String(runtime.currentWeek),
      timestamp,
    );
    await this.writeSetting(db, 'currentDay', safeCurrentDay, timestamp);
    await this.writeSetting(db, 'currentDaySelectedAt', '', timestamp);
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

  private async insertProgramState(
    db: SQLiteDatabase,
    runtime: PearLiftRuntimeState,
    input: {
      timestamp: string;
      sortOrder: number;
      isActive: boolean;
    },
  ) {
    const { timestamp, sortOrder, isActive } = input;
    const activeProgram =
      runtime.program ?? buildDefaultProgram(runtime.workouts);
    const normalizedDayConfigs = normalizeDayConfigs(
      runtime.workouts,
      runtime.dayConfigs,
    );
    const alignedWorkouts = alignWorkoutsToDays(
      runtime.workouts,
      normalizedDayConfigs,
    );

    if (isActive) {
      await db.runAsync(
        'UPDATE programs SET is_active = 0, updated_at = ? WHERE deleted_at IS NULL',
        timestamp,
      );
    }

    await db.runAsync(
      `INSERT INTO programs (
          id,
          name,
          subtitle,
          goal,
          description,
          source_json,
          start_date,
          duration_weeks,
          schedule_type,
          progression_model,
          frequency_summary_json,
          default_rest_seconds,
          is_active,
          sort_order,
          updated_at,
          deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      activeProgram.id,
      activeProgram.name,
      activeProgram.subtitle ?? null,
      activeProgram.goal ?? null,
      activeProgram.description ?? 'Primary training program',
      serializeProgramSource(activeProgram),
      activeProgram.startDate ?? null,
      activeProgram.durationWeeks ?? null,
      activeProgram.scheduleType ?? null,
      activeProgram.progressionModel ?? null,
      serializeFrequencySummary(activeProgram),
      activeProgram.defaultRestSeconds ?? null,
      isActive ? 1 : 0,
      sortOrder,
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
            session_label,
            icon,
            schedule_json,
            workout_name,
            workout_description,
            default_rest_seconds,
            sort_order,
            updated_at,
            deleted_at
          )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        workout.id,
        activeProgram.id,
        dayConfig?.name ?? workout.name,
        dayConfig?.sessionLabel ?? null,
        dayConfig?.icon ?? 'FitnessCenter',
        dayConfig?.schedule ? JSON.stringify(dayConfig.schedule) : null,
        workout.name,
        workout.description,
        workout.defaultRestSeconds ?? null,
        index,
        timestamp,
      );

      const orderedExercises = [...workout.exercises].sort(
        (a, b) => a.position - b.position,
      );
      for (const [position, exercise] of orderedExercises.entries()) {
        await db.runAsync(
          `INSERT INTO exercises (
              id, program_day_id, canonical_exercise_id, name, aliases_json, variant_label, session_specific, muscle_group, notes, advanced_json, sort_order, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          exercise.id,
          workout.id,
          exercise.canonicalExerciseId ?? null,
          exercise.name,
          serializeExerciseAliases(exercise.aliases),
          exercise.variantLabel ?? null,
          exercise.sessionSpecific ? 1 : 0,
          exercise.muscleGroup,
          exercise.notes,
          serializeExerciseAdvanced(exercise.advanced),
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
        const exerciseSettings = runtime.userExerciseSettings?.[exercise.id];
        if (exerciseSettings) {
          await db.runAsync(
            `INSERT INTO user_exercise_settings (
                exercise_id,
                working_weight,
                weight_unit,
                weight_mode,
                increment_kg,
                estimated_one_rep_max,
                notes,
                updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            exercise.id,
            exerciseSettings.workingWeight ?? null,
            exerciseSettings.weightUnit,
            exerciseSettings.weightMode,
            exerciseSettings.incrementKg ?? null,
            exerciseSettings.estimatedOneRepMax ?? null,
            exerciseSettings.notes ?? null,
            exerciseSettings.updatedAt || timestamp,
          );
        }
      }
    }

    for (const [index, week] of runtime.weekConfigs.entries()) {
      await db.runAsync(
        `INSERT INTO training_blocks (
            program_id,
            week_number,
            name,
            load_modifier,
            volume_modifier,
            rir,
            notes,
            sort_order,
            updated_at,
            deleted_at
          )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        activeProgram.id,
        week.id,
        week.name,
        week.loadModifier,
        week.volumeModifier ?? 1,
        week.rir,
        week.notes ?? null,
        index,
        timestamp,
      );
    }
  }

  private async readProgramSummaries(
    db: SQLiteDatabase,
  ): Promise<ProgramSummary[]> {
    const rows = await db.getAllAsync<
      ProgramRow & { is_active: number; workout_count: number }
    >(
      `SELECT
         p.id,
         p.name,
         p.subtitle,
         p.goal,
         p.description,
         p.source_json,
         p.start_date,
         p.duration_weeks,
         p.schedule_type,
         p.progression_model,
         p.frequency_summary_json,
         p.default_rest_seconds,
         p.updated_at,
         p.is_active,
         COUNT(d.id) as workout_count
       FROM programs p
       LEFT JOIN program_days d
         ON d.program_id = p.id
        AND d.deleted_at IS NULL
       WHERE p.deleted_at IS NULL
       GROUP BY
         p.id,
         p.name,
         p.subtitle,
         p.goal,
         p.description,
         p.source_json,
         p.start_date,
         p.duration_weeks,
         p.schedule_type,
         p.progression_model,
         p.frequency_summary_json,
         p.default_rest_seconds,
         p.updated_at,
         p.is_active
       ORDER BY p.is_active DESC, p.sort_order ASC, p.updated_at DESC`,
    );

    return rows.map((row) => ({
      ...(buildTrainingProgram(row, []) ?? {
        id: row.id,
        name: row.name,
        description: row.description,
        workoutIds: [],
      }),
      isActive: row.is_active === 1,
      workoutCount: row.workout_count ?? 0,
    }));
  }

  private async insertImportedProgramState(
    db: SQLiteDatabase,
    runtime: PearLiftRuntimeState,
    sessionLogs: WorkoutSessionLog[],
    activate: boolean,
  ) {
    const timestamp = nowIso();
    const existingProgramIds = new Set(
      (
        await db.getAllAsync<{ id: string }>(
          'SELECT id FROM programs WHERE deleted_at IS NULL',
        )
      ).map((row) => row.id),
    );
    const nextProgramId = buildImportedProgramId(
      runtime.program?.id ?? DEFAULT_PROGRAM_ID,
      existingProgramIds,
    );
    const imported = remapImportedProgram({
      runtime,
      sessionLogs,
      programId: nextProgramId,
      prefixChildIds: true,
    });
    const maxSortOrderRow = await db.getFirstAsync<{
      sort_order: number | null;
    }>(
      'SELECT MAX(sort_order) as sort_order FROM programs WHERE deleted_at IS NULL',
    );
    const sortOrder = (maxSortOrderRow?.sort_order ?? -1) + 1;

    await this.insertProgramState(db, imported.runtime, {
      timestamp,
      sortOrder,
      isActive: activate,
    });

    for (const log of imported.sessionLogs) {
      await this.saveWorkoutSessionLogInTransaction(db, log, timestamp);
    }

    if (activate) {
      await this.writeRuntimePreferences(db, imported.runtime, timestamp);
    }
  }

  private async replaceActiveProgramState(
    db: SQLiteDatabase,
    runtime: PearLiftRuntimeState,
    sessionLogs: WorkoutSessionLog[],
  ) {
    const timestamp = nowIso();
    const activeProgramId = await this.readActiveProgramId(db);

    await this.deleteProgramState(db, activeProgramId);

    const existingProgramIds = new Set(
      (
        await db.getAllAsync<{ id: string }>(
          `SELECT id
           FROM programs
           WHERE deleted_at IS NULL`,
        )
      ).map((row) => row.id),
    );
    const existingWorkoutIds = new Set(
      (
        await db.getAllAsync<{ id: string }>(
          'SELECT id FROM program_days WHERE deleted_at IS NULL',
        )
      ).map((row) => row.id),
    );
    const existingExerciseIds = new Set(
      (
        await db.getAllAsync<{ id: string }>(
          'SELECT id FROM exercises WHERE deleted_at IS NULL',
        )
      ).map((row) => row.id),
    );
    const nextProgramId = buildImportedProgramId(
      runtime.program?.id ?? DEFAULT_PROGRAM_ID,
      existingProgramIds,
    );
    const hasChildIdConflicts = runtime.workouts.some(
      (workout) =>
        existingWorkoutIds.has(workout.id) ||
        workout.exercises.some((exercise) =>
          existingExerciseIds.has(exercise.id),
        ),
    );
    const imported =
      nextProgramId === (runtime.program?.id ?? DEFAULT_PROGRAM_ID) &&
      !hasChildIdConflicts
        ? { runtime, sessionLogs }
        : remapImportedProgram({
            runtime,
            sessionLogs,
            programId: nextProgramId,
            prefixChildIds: true,
          });
    const maxSortOrderRow = await db.getFirstAsync<{
      sort_order: number | null;
    }>(
      'SELECT MIN(sort_order) as sort_order FROM programs WHERE deleted_at IS NULL',
    );
    const sortOrder = maxSortOrderRow?.sort_order ?? 0;

    await this.insertProgramState(db, imported.runtime, {
      timestamp,
      sortOrder,
      isActive: true,
    });

    for (const log of imported.sessionLogs) {
      await this.saveWorkoutSessionLogInTransaction(db, log, timestamp);
    }

    await this.writeRuntimePreferences(db, imported.runtime, timestamp);
  }

  private async deleteProgramState(db: SQLiteDatabase, programId: string) {
    const dayIds = await db.getAllAsync<{ id: string }>(
      `SELECT id
       FROM program_days
       WHERE program_id = ? AND deleted_at IS NULL`,
      programId,
    );

    for (const day of dayIds) {
      const exerciseIds = await db.getAllAsync<{ id: string }>(
        `SELECT id
         FROM exercises
         WHERE program_day_id = ? AND deleted_at IS NULL`,
        day.id,
      );
      for (const exercise of exerciseIds) {
        await db.runAsync(
          'DELETE FROM user_exercise_settings WHERE exercise_id = ?',
          exercise.id,
        );
        await db.runAsync(
          'DELETE FROM exercise_weights WHERE exercise_id = ?',
          exercise.id,
        );
        await db.runAsync(
          'DELETE FROM exercise_targets WHERE exercise_id = ?',
          exercise.id,
        );
      }
      await db.runAsync(
        'DELETE FROM exercises WHERE program_day_id = ?',
        day.id,
      );
    }

    await db.runAsync(
      'DELETE FROM training_blocks WHERE program_id = ?',
      programId,
    );
    for (const day of dayIds) {
      await db.runAsync(
        'DELETE FROM workout_session_logs WHERE workout_id = ?',
        day.id,
      );
    }
    await db.runAsync(
      'DELETE FROM workout_session_logs WHERE program_id = ?',
      programId,
    );
    await db.runAsync(
      'DELETE FROM program_days WHERE program_id = ?',
      programId,
    );
    await db.runAsync('DELETE FROM programs WHERE id = ?', programId);
  }

  private async saveWorkoutSessionLogInTransaction(
    db: SQLiteDatabase,
    log: WorkoutSessionLog,
    updatedAt: string,
  ) {
    await db.runAsync(
      `INSERT INTO workout_session_logs (
          id,
          program_id,
          workout_id,
          workout_name_snapshot,
          started_at,
          completed_at,
          week_number,
          payload_json,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          program_id = excluded.program_id,
          workout_id = excluded.workout_id,
          workout_name_snapshot = excluded.workout_name_snapshot,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          week_number = excluded.week_number,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at`,
      log.id,
      log.programId ?? null,
      log.workoutId,
      log.workoutNameSnapshot,
      log.startedAt,
      log.completedAt ?? null,
      log.weekNumber ?? null,
      JSON.stringify(log),
      updatedAt,
    );
  }

  private async normalizeSelectedProgramState(
    db: SQLiteDatabase,
    programId: string,
    timestamp: string,
  ) {
    const selectedDayIds = await db.getAllAsync<{ id: string }>(
      `SELECT id
       FROM program_days
       WHERE program_id = ? AND deleted_at IS NULL
       ORDER BY sort_order ASC`,
      programId,
    );
    const currentDay = await this.readSetting(db, 'currentDay');
    const currentWeek = parseNumber(
      await this.readSetting(db, 'currentWeek'),
      1,
    );
    const weekCountRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) as total
       FROM training_blocks
       WHERE program_id = ? AND deleted_at IS NULL`,
      programId,
    );
    const safeDay = selectedDayIds.some((row) => row.id === currentDay)
      ? (currentDay ??
        selectedDayIds[0]?.id ??
        defaultDayConfigs[0]?.id ??
        'push')
      : (selectedDayIds[0]?.id ?? defaultDayConfigs[0]?.id ?? 'push');
    const weekCount = weekCountRow?.total ?? 0;
    const safeWeek =
      weekCount > 0
        ? Math.min(Math.max(1, currentWeek), weekCount)
        : Math.max(1, currentWeek);

    await this.writeSetting(db, 'currentDay', safeDay, timestamp);
    await this.writeSetting(db, 'currentWeek', String(safeWeek), timestamp);
  }

  private async readRuntimeState(
    dbArg?: SQLiteDatabase,
    programIdArg?: string,
  ): Promise<PearLiftRuntimeState> {
    const db = dbArg ?? (await getDatabase());
    const program = programIdArg
      ? await db.getFirstAsync<ProgramRow>(
          `SELECT
             id,
             name,
             subtitle,
             goal,
             description,
             source_json,
             start_date,
             duration_weeks,
             schedule_type,
             progression_model,
             frequency_summary_json,
             default_rest_seconds,
             updated_at
           FROM programs
           WHERE deleted_at IS NULL AND id = ?
           LIMIT 1`,
          programIdArg,
        )
      : await db.getFirstAsync<ProgramRow>(
          `SELECT
             id,
             name,
             subtitle,
             goal,
             description,
             source_json,
             start_date,
             duration_weeks,
             schedule_type,
             progression_model,
             frequency_summary_json,
             default_rest_seconds,
             updated_at
           FROM programs
           WHERE deleted_at IS NULL AND is_active = 1
           ORDER BY sort_order ASC
           LIMIT 1`,
        );
    const activeProgramId = program?.id ?? DEFAULT_PROGRAM_ID;
    const workouts = await db.getAllAsync<ProgramDayRow>(
      `SELECT
         id,
         day_label,
         session_label,
         icon,
         schedule_json,
         workout_name,
         workout_description,
         default_rest_seconds,
         sort_order
       FROM program_days
       WHERE deleted_at IS NULL AND program_id = ?
       ORDER BY sort_order ASC`,
      activeProgramId,
    );
    const exercises = await db.getAllAsync<ExerciseRow>(
      `SELECT
         e.id,
         e.program_day_id,
         e.canonical_exercise_id,
         e.name,
         e.aliases_json,
         e.variant_label,
         e.session_specific,
         e.muscle_group,
         e.notes,
         e.advanced_json,
         e.sort_order
       FROM exercises e
       INNER JOIN program_days d
         ON d.id = e.program_day_id
       WHERE e.deleted_at IS NULL
         AND d.deleted_at IS NULL
         AND d.program_id = ?
       ORDER BY e.program_day_id ASC, e.sort_order ASC`,
      activeProgramId,
    );
    const exerciseTargets = await db.getAllAsync<ExerciseTargetRow>(
      `SELECT
         t.exercise_id,
         t.sets,
         t.reps,
         t.base_weight
       FROM exercise_targets t
       INNER JOIN exercises e
         ON e.id = t.exercise_id
       INNER JOIN program_days d
         ON d.id = e.program_day_id
       WHERE e.deleted_at IS NULL
         AND d.deleted_at IS NULL
         AND d.program_id = ?`,
      activeProgramId,
    );
    const weights = await db.getAllAsync<WeightRow>(
      `SELECT
         w.exercise_id,
         w.value
       FROM exercise_weights w
       INNER JOIN exercises e
         ON e.id = w.exercise_id
       INNER JOIN program_days d
         ON d.id = e.program_day_id
       WHERE e.deleted_at IS NULL
         AND d.deleted_at IS NULL
         AND d.program_id = ?`,
      activeProgramId,
    );
    const userExerciseSettingsRows =
      await db.getAllAsync<UserExerciseSettingsRow>(
        `SELECT
           s.exercise_id,
           s.working_weight,
           s.weight_unit,
           s.weight_mode,
           s.increment_kg,
           s.estimated_one_rep_max,
           s.notes,
           s.updated_at
         FROM user_exercise_settings s
         INNER JOIN exercises e
           ON e.id = s.exercise_id
         INNER JOIN program_days d
           ON d.id = e.program_day_id
         WHERE e.deleted_at IS NULL
           AND d.deleted_at IS NULL
           AND d.program_id = ?`,
        activeProgramId,
      );
    const weekConfigs = await db.getAllAsync<WeekConfigRow>(
      `SELECT
         week_number,
         name,
         load_modifier,
         volume_modifier,
         rir,
         notes,
         sort_order
       FROM training_blocks
       WHERE deleted_at IS NULL AND program_id = ?
       ORDER BY sort_order ASC, week_number ASC`,
      activeProgramId,
    );
    const settingsMap = await this.readSettingsMap(db);

    const exerciseMap = buildExerciseMap(exercises, exerciseTargets);
    const userWeights = buildUserWeights(weights);
    const userExerciseSettings = buildUserExerciseSettings(
      userExerciseSettingsRows,
    );

    const runtimeWorkouts = workouts.map((workout) => ({
      id: workout.id,
      name: workout.workout_name,
      description: workout.workout_description,
      ...(workout.default_rest_seconds != null
        ? { defaultRestSeconds: workout.default_rest_seconds }
        : {}),
      exercises: (exerciseMap.get(workout.id) ?? []).sort(
        (a, b) => a.position - b.position,
      ),
    }));

    return {
      program:
        buildTrainingProgram(
          program,
          workouts.map((workout) => workout.id),
        ) ??
        buildDefaultProgram(
          runtimeWorkouts.length > 0 ? runtimeWorkouts : cloneDefaultWorkouts(),
        ),
      workouts:
        runtimeWorkouts.length > 0 ? runtimeWorkouts : cloneDefaultWorkouts(),
      userWeights,
      userExerciseSettings,
      weekConfigs: weekConfigs.map((week) => ({
        id: week.week_number,
        name: week.name,
        loadModifier: week.load_modifier,
        ...(week.volume_modifier != null
          ? { volumeModifier: week.volume_modifier }
          : {}),
        rir: week.rir,
        ...(week.notes ? { notes: week.notes } : {}),
      })),
      dayConfigs:
        workouts.length > 0
          ? workouts.map((day) => ({
              id: day.id,
              name: day.day_label,
              ...(day.session_label ? { sessionLabel: day.session_label } : {}),
              icon: day.icon,
              schedule: buildDayConfigSchedule(day.schedule_json),
            }))
          : defaultDayConfigs,
      currentWeek: parseNumber(settingsMap.get('currentWeek'), 1),
      currentDay: workouts.some(
        (day) => day.id === settingsMap.get('currentDay'),
      )
        ? (settingsMap.get('currentDay') ?? defaultDayConfigs[0]?.id ?? 'push')
        : (workouts[0]?.id ?? defaultDayConfigs[0]?.id ?? 'push'),
      restDuration: parseNumber(settingsMap.get('restDuration'), 150),
      themeMode: coerceThemeMode(settingsMap.get('themeMode')),
      weightUnit: coerceWeightUnit(settingsMap.get('weightUnit')),
      language: coerceLanguage(settingsMap.get('language')),
    };
  }

  private async readBackupProgramCollection(
    db: SQLiteDatabase,
  ): Promise<BackupProgramCollection> {
    const [programRows, settingsMap, allLogs] = await Promise.all([
      db.getAllAsync<ProgramRow & { is_active: number }>(
        `SELECT
           id,
           name,
           subtitle,
           goal,
           description,
           source_json,
           start_date,
           duration_weeks,
           schedule_type,
           progression_model,
           frequency_summary_json,
           default_rest_seconds,
           updated_at,
           is_active
         FROM programs
         WHERE deleted_at IS NULL
         ORDER BY is_active DESC, sort_order ASC, updated_at DESC`,
      ),
      this.readSettingsMap(db),
      this.getWorkoutSessionLogs({ limit: null }),
    ]);

    const programStates = await Promise.all(
      programRows.map(async (programRow) => {
        const runtime = await this.readRuntimeState(db, programRow.id);
        return {
          ...runtime,
          program:
            runtime.program ??
            buildDefaultProgram(
              runtime.workouts.length > 0
                ? runtime.workouts
                : cloneDefaultWorkouts(),
            ),
          sessionLogs: allLogs.filter(
            (log) =>
              log.programId === programRow.id ||
              runtime.workouts.some((workout) => workout.id === log.workoutId),
          ),
          currentWeek: parseNumber(settingsMap.get('currentWeek'), 1),
          restDuration: parseNumber(settingsMap.get('restDuration'), 150),
          themeMode: coerceThemeMode(settingsMap.get('themeMode')),
          weightUnit: coerceWeightUnit(settingsMap.get('weightUnit')),
          language: coerceLanguage(settingsMap.get('language')),
        };
      }),
    );

    return {
      programs: programStates,
      activeProgramId:
        programRows.find((programRow) => programRow.is_active === 1)?.id ??
        null,
    };
  }

  private async readSettingsMap(db: SQLiteDatabase) {
    const settings = await db.getAllAsync<AppSettingRow>(
      'SELECT key, value FROM user_preferences',
    );
    return toSettingsMap(settings);
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

  private async getExercisesForWorkout(db: SQLiteDatabase, workoutId: string) {
    return db.getAllAsync<ExerciseRow>(
      `SELECT id, program_day_id, canonical_exercise_id, name, aliases_json, variant_label, session_specific, muscle_group, notes, advanced_json, sort_order
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

  private async readActiveProgramId(db: SQLiteDatabase) {
    const row = await db.getFirstAsync<{ id: string }>(
      `SELECT id
       FROM programs
       WHERE deleted_at IS NULL AND is_active = 1
       ORDER BY sort_order ASC
       LIMIT 1`,
    );
    return row?.id ?? DEFAULT_PROGRAM_ID;
  }
}

export type WorkoutRepository = WorkoutRepositoryPort;

export function createWorkoutRepository(): WorkoutRepositoryPort {
  return new WorkoutRepositoryImpl();
}
