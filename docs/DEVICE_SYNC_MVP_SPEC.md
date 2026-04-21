# PearLift Device-to-Device Sync MVP Spec (Holepunch)

## 1. Scope

### Goals
- Keep SQLite as source of truth.
- Sync between user-owned devices over P2P only.
- Support offline edits and eventual convergence.
- Keep existing non-sync users unaffected.

### Non-goals (MVP)
- Background always-on sync (especially iOS).
- Conflict UI.
- Partial sharing / friend sync.

## 2. Runtime Architecture (MVP)

- React Native UI + Zustand store remain unchanged for primary data flow.
- `SyncManager` is a sidecar service: local mutation events in, remote ops out.
- Holepunch stack runs in a dedicated native/Bare-backed runtime and communicates with JS through a typed bridge.
- SQLite stays canonical; CRDT log is transport and merge layer.

## 3. Canonical Sync Operation Envelope

Use operation-based sync (not full state snapshots).

```ts
export const SYNC_OP_SCHEMA_VERSION = 1 as const;

export type SyncMutation =
  | { type: 'setThemeMode'; themeMode: 'system' | 'light' | 'dark' }
  | { type: 'setCurrentWeek'; currentWeek: number }
  | { type: 'setCurrentDay'; currentDay: string }
  | { type: 'setRestDuration'; restDuration: number }
  | { type: 'setWeightUnit'; weightUnit: 'kg' | 'lb' }
  | { type: 'setLanguage'; language: string }
  | { type: 'setExerciseWeight'; exerciseId: string; value: number }
  | {
      type: 'addExercise';
      workoutId: string;
      exercise: {
        id: string;
        name: string;
        sets: number;
        reps: string;
        baseWeight: number;
        muscleGroup: string;
        notes: string;
        position: number;
      };
    }
  | {
      type: 'editExercise';
      workoutId: string;
      exerciseId: string;
      updates: Partial<{
        name: string;
        sets: number;
        reps: string;
        baseWeight: number;
        muscleGroup: string;
        notes: string;
        position: number;
      }>;
    }
  | { type: 'deleteExercise'; workoutId: string; exerciseId: string }
  | {
      type: 'reorderExercises';
      workoutId: string;
      orderedExerciseIds: string[];
    }
  | { type: 'replaceWeekConfigs'; weekConfigs: Array<{ id: number; name: string; loadModifier: number; rir: number }> }
  | { type: 'replaceDayConfigs'; dayConfigs: Array<{ id: string; name: string; icon: string }> };

export interface SyncOpEnvelope {
  schemaVersion: 1;
  opId: string; // uuidv7 recommended
  deviceId: string; // stable per-install ID (SecureStore)
  lamport: number; // monotonic logical clock per device
  createdAt: string; // ISO8601 for UX/debug only
  mutation: SyncMutation;
}
```

### Canonicalization rules
- Never sync `adjustExerciseWeight`; convert to `setExerciseWeight` before publish.
- `resetAllData` is local-only in MVP.
- `restoreRuntimeState` is local import/migration only; not synced.

## 4. SQLite Schema Changes

Add to `src/storage/database.ts` migration SQL:

```sql
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

CREATE INDEX IF NOT EXISTS idx_sync_applied_ops_device_lamport
ON sync_applied_ops(device_id, lamport);
```

Notes:
- `sync_state` is singleton row (`id = 1`).
- Pairing secret should be encrypted before persistence (or store only in SecureStore and keep DB fields null).
- `sync_applied_ops` guarantees idempotency and prevents loop replay.

## 5. Repository Contract Changes

File: `src/storage/types.ts`

```ts
export type MutationOrigin = 'local' | 'remote';

export interface MutationContext {
  origin: MutationOrigin;
  opId?: string;
  deviceId?: string;
  lamport?: number;
  suppressSyncEmit?: boolean;
}
```

File: `src/storage/workoutRepository.ts`

```ts
applyMutation(mutation: WorkoutMutation, ctx?: MutationContext): Promise<void>
hasAppliedSyncOp(opId: string): Promise<boolean>
markSyncOpApplied(meta: { opId: string; deviceId: string; lamport: number }): Promise<void>
nextLamport(): Promise<number>
getOrCreateDeviceId(): Promise<string>
setSyncState(patch: Partial<SyncStateRow>): Promise<void>
getSyncState(): Promise<SyncStateRow>
```

Behavior:
- For `ctx.origin === 'remote'`, first check `hasAppliedSyncOp(opId)`.
- If already applied: no-op.
- If applied successfully: `markSyncOpApplied` in same write queue.
- Existing transaction queue remains the only write path.

## 6. Sync Manager API (JS-facing)

New file: `src/sync/types.ts`

```ts
export type SyncStatus = 'idle' | 'connecting' | 'synced' | 'error';

export interface SyncHealth {
  status: SyncStatus;
  peers: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface StartSyncInput {
  pairingSecretBase64: string; // 32-byte secret
  deviceId: string;
  bootstrapKeyHex?: string | null;
}

export interface SyncBridge {
  start(input: StartSyncInput): Promise<{ bootstrapKeyHex: string }>;
  stop(): Promise<void>;
  publish(op: SyncOpEnvelope): Promise<void>;
  onRemoteOp(cb: (op: SyncOpEnvelope) => void): () => void;
  onStatus(cb: (health: SyncHealth) => void): () => void;
}
```

New file: `src/sync/syncManager.ts`

```ts
start(pairingSecretBase64: string): Promise<void>
stop(): Promise<void>
publishLocalMutation(mutation: WorkoutMutation): Promise<void>
handleRemoteOp(op: SyncOpEnvelope): Promise<void>
getHealth(): SyncHealth
```

## 7. Zustand Store Additions

File: `src/store/workoutStore.ts`

```ts
syncStatus: SyncStatus;
syncPeers: number;
lastSyncedAt: string | null;
syncError: string | null;

startSync: (pairingSecretBase64: string) => Promise<void>;
stopSync: () => Promise<void>;
setSyncHealth: (health: SyncHealth) => void;
```

Flow:
- `applyMutation(mutation)` stays primary path.
- After successful local DB apply, if sync active, call `syncManager.publishLocalMutation(mutation)`.
- Remote ops call `repository.applyMutation(mappedMutation, { origin: 'remote', opId, deviceId, lamport, suppressSyncEmit: true })`.

## 8. Pairing and Secret Format

- Generate random 32-byte secret with `expo-crypto`.
- Store in `expo-secure-store` under `pearlift.sync.secret`.
- Display/share as:
  - QR payload JSON: `{"v":1,"s":"<base64url-32b>","b":"<optional-bootstrap-key-hex>"}`
  - Manual code: short checksum + segmented base32 string (not 6-digit only).

## 9. Conflict Rules (MVP)

- Convergence anchor: Autobase causal order.
- Deterministic merges in repository layer:
  - scalar settings: last applied op in causal order wins.
  - exercise edits: field-wise overwrite from later op.
  - reorder: latest reorder for workout wins.
- No wall-clock arbitration except UI timestamps.

## 10. File-Level Implementation Plan

1. `src/storage/database.ts`
- Add new sync tables.

2. `src/storage/types.ts`
- Add `MutationContext` and sync-related types.

3. `src/storage/workoutRepository.ts`
- Add idempotency methods and context-aware `applyMutation`.
- Add lamport and device ID helpers through `sync_state`.

4. `src/sync/types.ts` (new)
- Define sync envelope and status contracts.

5. `src/sync/syncManager.ts` (new)
- Bridge-local orchestration logic.

6. `src/store/workoutStore.ts`
- Add sync health state and `startSync/stopSync` actions.
- Emit local successful mutations to manager.

7. `src/components/modals/SettingsModal.tsx`
- Replace disabled sync button with active entrypoint.
- Show status + peer count + last sync time.

8. Native module (new module folder, similar to `modules/pearlift-rest-timer-fgs`)
- Expose `start/stop/publish/status/events` bridge.

## 11. Acceptance Criteria (MVP)

- Two devices with same pairing secret converge to same snapshot after reconnect.
- Duplicate remote op delivery does not change DB after first apply.
- Local-only users see no behavior change.
- App restart preserves sync state and resumes connection when enabled.
- Sync failure surfaces non-blocking error in UI and app remains usable offline.

## 12. Minimal Test Matrix

- Unit:
  - `canonicalizeMutation(adjustExerciseWeight) -> setExerciseWeight`
  - idempotent remote apply (`op_id` already seen)
  - lamport increments monotonically

- Integration:
  - local mutation -> emitted op -> remote apply -> equal snapshots
  - offline edits on both devices -> reconnect -> converged state

- Manual:
  - enable sync, kill app, reopen, verify resume
  - wrong pairing secret cannot read valid history

