import * as SQLite from 'expo-sqlite';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function configureDatabase(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY NOT NULL,
      workout_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sets INTEGER NOT NULL,
      reps TEXT NOT NULL,
      base_weight REAL NOT NULL,
      muscle_group TEXT NOT NULL,
      notes TEXT NOT NULL,
      position INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_weights (
      exercise_id TEXT PRIMARY KEY NOT NULL,
      value REAL NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS week_configs (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      load_modifier REAL NOT NULL,
      rir INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS day_configs (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      sync_enabled INTEGER NOT NULL DEFAULT 0,
      device_id TEXT,
      pairing_secret_ciphertext TEXT,
      pairing_secret_iv TEXT,
      pairing_secret_tag TEXT,
      autobase_bootstrap_key TEXT,
      lamport_counter INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_synced_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_applied_ops (
      op_id TEXT PRIMARY KEY NOT NULL,
      device_id TEXT NOT NULL,
      lamport INTEGER NOT NULL,
      applied_at TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS sync_room_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      sync_role TEXT,
      room_binding_state TEXT NOT NULL DEFAULT 'unconfigured',
      first_sync_resolution TEXT NOT NULL DEFAULT 'unknown',
      pending_local_summary TEXT,
      pending_remote_summary TEXT,
      pending_conflict_summary TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_profile_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sync_applied_ops_device_lamport
    ON sync_applied_ops(device_id, lamport);

    CREATE INDEX IF NOT EXISTS idx_sync_applied_ops_applied_at
    ON sync_applied_ops(applied_at);

    CREATE INDEX IF NOT EXISTS idx_sync_devices_last_seen
    ON sync_devices(last_seen DESC);

    CREATE INDEX IF NOT EXISTS idx_sync_outbox_created_at
    ON sync_outbox(created_at, id);

    CREATE INDEX IF NOT EXISTS idx_sync_profile_outbox_created_at
    ON sync_profile_outbox(created_at, id);

  `);

  try {
    await ensureSyncStateColumns(db);
    await ensureSyncRoomStateSeed(db);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[database] sync schema migration failed', error);
  }
}

async function ensureSyncStateColumns(db: SQLite.SQLiteDatabase) {
  const columns = [
    ['sync_role', 'TEXT'],
    ['room_binding_state', "TEXT NOT NULL DEFAULT 'unconfigured'"],
    ['first_sync_resolution', "TEXT NOT NULL DEFAULT 'unknown'"],
    ['pending_local_summary', 'TEXT'],
    ['pending_remote_summary', 'TEXT'],
    ['pending_conflict_summary', 'TEXT'],
  ] as const;

  for (const [name, definition] of columns) {
    try {
      await db.runAsync(
        `ALTER TABLE sync_state ADD COLUMN ${name} ${definition}`,
      );
    } catch {
      // Existing installs already have the column.
    }
  }
}

async function ensureSyncRoomStateSeed(db: SQLite.SQLiteDatabase) {
  await db.runAsync(
    `INSERT OR IGNORE INTO sync_room_state (
      id,
      sync_role,
      room_binding_state,
      first_sync_resolution,
      pending_local_summary,
      pending_remote_summary,
      pending_conflict_summary,
      updated_at
    ) VALUES (1, NULL, 'unconfigured', 'unknown', NULL, NULL, NULL, datetime('now'))`,
  );
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
