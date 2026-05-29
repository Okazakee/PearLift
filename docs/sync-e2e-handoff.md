# Sync E2E And Coverage Handoff

## Scope Added So Far

This branch/worktree includes:

- Bun unit coverage additions for:
  - first-sync logic
  - sync mutation helpers and buffering rules
  - conflict preview / merge helpers
  - backup diff / migration / QR codec helpers
- Maestro Android E2E harness under `.maestro/`
- local E2E runner scripts under `scripts/e2e/`
- broad `testID` coverage across onboarding, settings, workout CRUD, rest timer, backup, sync, and debug surfaces
- E2E mode wiring through `EXPO_PUBLIC_PEARLIFT_E2E=1`
- sync debug modal improvements for manual and automated inspection
- two-emulator sync runner scaffolding for:
  - room creation / join
  - rename propagation
  - workout mutation propagation
  - delete propagation

## Verified Passing Before Latest Sync Iteration

These were passing earlier in this workstream and remain the last verified green checks:

- `bun run lint`
- `bun run typecheck`
- `bun test`
- single-emulator Maestro suite on `emulator-5554`:
  - onboarding
  - home smoke
  - settings appearance
  - settings reset prompt
  - workout CRUD
  - program settings
  - rest timer
  - rest timer background flows
  - backup QR export
  - sync debug
  - sync rename device

## Current State Of Two-Emulator Sync Work

The main open area is still real cross-device sync verification.

### What is implemented

- `scripts/e2e/run-sync-two-emulator.mjs` orchestrates the two-emulator flow.
- Create-room flow now attempts to capture deterministic sync parts instead of relying only on the long invite blob.
- Sync debug page now exposes more targeted values for E2E/manual debugging.
- Rename propagation, data mutation propagation, and delete propagation flows exist in `.maestro/flows/`.

### What is still not green

Two-emulator sync is not fully verified green yet.

The open problem has moved around between:

1. harness-level issues
   - Maestro truncating the long invite string in logs/clipboard-based output
   - Maestro view-hierarchy instability (`Illegal character (U+0)`) while scanning some sync screens
   - hidden E2E-only debug fields being unreliable for `copyTextFrom`

2. actual sync-behavior verification
   - rename propagation still not proven consistently
   - workout mutation propagation still not proven consistently
   - delete propagation still not proven consistently
   - reorder propagation flow is still planned but not finished/verified

## Important Findings

### 1. Wrong rebuild path can silently disable E2E surfaces

The raw Gradle path:

```bash
cd android && ./gradlew app:assembleRelease
```

does **not** set `EXPO_PUBLIC_PEARLIFT_E2E=1`.

That means:

- `IS_E2E` becomes false
- E2E-only debug/create-room fields disappear
- sync invite text collapses again
- Maestro selectors for E2E-only fields fail even though the code exists

Use this path for emulator E2E builds instead:

```bash
rtk bun run e2e:android:build
```

Then reinstall:

```bash
rtk proxy env MAESTRO_DEVICE_A=emulator-5554 bun run e2e:android:install
rtk proxy env MAESTRO_DEVICE_A=emulator-5556 bun run e2e:android:install
```

### 2. Current create-room E2E field issue

The latest code adds E2E-only `pairingSecretHex` and `bootstrapKeyHex` fields to `SyncCreateRoomModal`, but the last runtime check that failed was against a non-E2E build.

So the latest failure:

- `sync.create.pairingSecret` not found

is not strong evidence that the code is wrong. It is likely evidence that the wrong APK variant was installed.

### 3. Current debug page direction

The debug page is being shifted away from one giant hidden raw dump toward explicit, stable fields that are useful both for manual debugging and for Maestro:

- room state
- first-sync resolution
- paired device names
- autobase key
- topic
- last error
- recent log keys

This is the right direction. It is more stable than hidden offscreen payload blobs.

## Files Added / Meaningfully Changed In This Phase

Key files to inspect first:

- `docs/sync-e2e-handoff.md`
- `scripts/e2e/run-sync-two-emulator.mjs`
- `scripts/e2e/common.mjs`
- `.maestro/flows/sync-create-capture.yaml`
- `.maestro/flows/sync-copy-debug-payloads.yaml`
- `.maestro/flows/sync-copy-master-key.yaml`
- `.maestro/scripts/log-sync-create-parts.js`
- `.maestro/scripts/log-sync-diagnostics.js`
- `src/components/modals/SyncCreateRoomModal.tsx`
- `src/components/modals/SyncDebugInfoModal.tsx`
- `src/config/e2e.ts`
- `src/config/testIds.ts`
- `src/components/modals/settings/SyncSection.tsx`
- `src/components/modals/SettingsModal.tsx`
- `src/sync/syncManager.ts`
- `src/sync/manager/remoteApply.ts`
- `backend/sync-backend.mjs`
- `tests/syncHelpers.test.ts`
- `tests/syncConflictPreview.test.ts`
- `tests/backupDiff.test.ts`
- `tests/backupMigration.test.ts`
- `tests/backupQrCodec.test.ts`

## Recommended Next Steps

1. Build the **actual E2E APK** again:

```bash
rtk bun run e2e:android:build
```

2. Reinstall to both emulators:

```bash
rtk proxy env MAESTRO_DEVICE_A=emulator-5554 bun run e2e:android:install
rtk proxy env MAESTRO_DEVICE_A=emulator-5556 bun run e2e:android:install
```

3. Re-run the two-emulator sync runner:

```bash
rtk proxy env MAESTRO_DEVICE_A=emulator-5554 MAESTRO_DEVICE_B=emulator-5556 bun run e2e:android:sync
```

4. If that still fails, separate the failure class:
- if create-room E2E fields are now visible, the earlier issue was just wrong build mode
- if join/create succeeds but rename or workout propagation fails, move to actual sync behavior debugging
- if Maestro still crashes on hierarchy reads, isolate that as an automation instability and keep the new explicit debug fields as the workaround surface

5. After harness is stable, add/finish:
- reorder propagation E2E
- week/day/program-setting propagation E2E
- reconnect / restart sync coverage
- first-sync conflict-choice E2E

## Current Bottom Line

The coverage surface is materially better than before, and the sync debug page is meaningfully improved.

The remaining hard problem is still the same one that matters most:

- prove that real cross-device sync behavior is green for rename, workout mutations, delete, and reorder
- and fix the actual sync logic if those flows still fail after the E2E harness is fully deterministic

At the moment, that proof is not finished yet.
