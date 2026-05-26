import * as SQLite from 'expo-sqlite';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA_GENERATION = 3;

async function dropAllTables(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    DROP TABLE IF EXISTS sync_profile_outbox;
    DROP TABLE IF EXISTS sync_outbox;
    DROP TABLE IF EXISTS sync_applied_ops;
    DROP TABLE IF EXISTS sync_devices;
    DROP TABLE IF EXISTS sync_room_state;
    DROP TABLE IF EXISTS sync_identity_state;

    DROP TABLE IF EXISTS user_preferences;
    DROP TABLE IF EXISTS training_blocks;
    DROP TABLE IF EXISTS exercise_weights;
    DROP TABLE IF EXISTS exercise_targets;
    DROP TABLE IF EXISTS exercises;
    DROP TABLE IF EXISTS program_days;
    DROP TABLE IF EXISTS programs;

    DROP TABLE IF EXISTS app_settings;
    DROP TABLE IF EXISTS day_configs;
    DROP TABLE IF EXISTS week_configs;
    DROP TABLE IF EXISTS user_weights;
    DROP TABLE IF EXISTS workouts;
    DROP TABLE IF EXISTS sync_state;
  `);
}

async function ensureLocalSchema(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS program_days (
      id TEXT PRIMARY KEY NOT NULL,
      program_id TEXT NOT NULL,
      day_label TEXT NOT NULL,
      icon TEXT NOT NULL,
      workout_name TEXT NOT NULL,
      workout_description TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY NOT NULL,
      program_day_id TEXT NOT NULL,
      name TEXT NOT NULL,
      muscle_group TEXT NOT NULL,
      notes TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (program_day_id) REFERENCES program_days(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exercise_targets (
      exercise_id TEXT PRIMARY KEY NOT NULL,
      sets INTEGER NOT NULL,
      reps TEXT NOT NULL,
      base_weight REAL NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exercise_weights (
      exercise_id TEXT PRIMARY KEY NOT NULL,
      value REAL NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS training_blocks (
      id INTEGER PRIMARY KEY NOT NULL,
      program_id TEXT NOT NULL,
      name TEXT NOT NULL,
      load_modifier REAL NOT NULL,
      rir INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_program_days_program_sort
    ON program_days(program_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_exercises_day_sort
    ON exercises(program_day_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_training_blocks_program_sort
    ON training_blocks(program_id, sort_order);
  `);
}

async function ensureSyncSchema(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_identity_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      sync_enabled INTEGER NOT NULL DEFAULT 0,
      device_id TEXT,
      pairing_secret_ciphertext TEXT,
      pairing_secret_iv TEXT,
      pairing_secret_tag TEXT,
      lamport_counter INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_synced_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_room_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      room_id TEXT NOT NULL DEFAULT 'default',
      sync_role TEXT,
      room_binding_state TEXT NOT NULL DEFAULT 'unconfigured',
      first_sync_resolution TEXT NOT NULL DEFAULT 'unknown',
      autobase_bootstrap_key TEXT,
      pending_local_summary TEXT,
      pending_remote_summary TEXT,
      pending_conflict_summary TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_applied_ops (
      room_id TEXT NOT NULL,
      op_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      lamport INTEGER NOT NULL,
      applied_at TEXT NOT NULL,
      PRIMARY KEY (room_id, op_id)
    );

    CREATE TABLE IF NOT EXISTS sync_devices (
      device_id TEXT PRIMARY KEY NOT NULL,
      device_code TEXT NOT NULL,
      display_name TEXT NOT NULL,
      writer_key TEXT,
      last_seen TEXT NOT NULL,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_profile_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sync_applied_ops_device_lamport
    ON sync_applied_ops(room_id, device_id, lamport);

    CREATE INDEX IF NOT EXISTS idx_sync_applied_ops_applied_at
    ON sync_applied_ops(room_id, applied_at);

    CREATE INDEX IF NOT EXISTS idx_sync_devices_last_seen
    ON sync_devices(last_seen DESC);

    CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending
    ON sync_outbox(room_id, status, created_at, id);

    CREATE INDEX IF NOT EXISTS idx_sync_profile_outbox_pending
    ON sync_profile_outbox(room_id, status, created_at, id);
  `);

  const now = new Date().toISOString();
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
    now,
  );
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
    ) VALUES (1, 'default', NULL, 'unconfigured', 'unknown', NULL, NULL, NULL, NULL, ?)`,
    now,
  );
}

async function configureDatabase(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion > SCHEMA_GENERATION) {
    throw new Error(
      `Database version (${currentVersion}) is newer than this app supports (${SCHEMA_GENERATION}). Downgrading is not supported.`,
    );
  }

  if (currentVersion !== SCHEMA_GENERATION) {
    await dropAllTables(db);
  }

  await ensureLocalSchema(db);

  try {
    await ensureSyncSchema(db);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[database] sync schema setup failed', error);
  }

  if (currentVersion !== SCHEMA_GENERATION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_GENERATION};`);
  }
}

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('pearlift.db').then(
      async (db) => {
        await configureDatabase(db);
        return db;
      },
    );
  }

  return databasePromise;
}
