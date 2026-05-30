# Dual-Device Sync + Timer Debug Runbook

Purpose: run PearLift on an Android emulator and a real Android phone at the
same time, then capture targeted logs for sync state and native timer behavior.

## Preconditions

- Android emulator tooling installed (`emulator`, `adb`)
- At least one AVD available (example: `Pixel_9`)
- Physical Android device connected over USB with USB debugging enabled

## 1) Start emulator

```bash
rtk emulator -avd Pixel_9 -port 5554
```

## 2) Verify both Android targets

```bash
rtk adb devices -l
```

Expected: one `emulator-5554` entry and one physical device serial.

## 3) Build and install E2E APK

```bash
bun run e2e:android:build
adb -s <device_a> install -r android/app/build/outputs/apk/release/app-release.apk
adb -s <device_b> install -r android/app/build/outputs/apk/release/app-release.apk
```

## 4) Run automated sync test

```bash
MAESTRO_DEVICE_A=<serial_a> MAESTRO_DEVICE_B=<serial_b> bun run e2e:android:sync
```

This runs the full flow: create room → join → rename → mutate → assert sync propagation.

## 5) Quick diagnostics via Maestro

Capture sync state on either device without logcat:

```bash
maestro --device <serial> test .maestro/flows/sync-copy-debug-payloads.yaml
```

Read the SYNC_DIAGNOSTICS JSON in `~/.maestro/tests/<latest>/maestro.log` for:
`status`, `syncRole`, `roomState`, `firstSyncResolution`, `connections`, `pairedDeviceNames`, `autobaseKey`, `lastError`.

## 6) Capture logs in parallel

Terminal A (emulator):

```bash
rtk sh -lc 'adb -s emulator-5554 logcat -v threadtime | rg "pearlift-sync|ReactNativeJS|RestTimer|BareKit"'
```

Terminal B (phone):

```bash
rtk sh -lc 'adb -s <PHONE_SERIAL> logcat -v threadtime | rg "pearlift-sync|ReactNativeJS|RestTimer|BareKit"'
```

## 7) Repro sequence to run while both logs are active

1. Launch both app instances.
2. Start/join same sync room.
3. Make workout mutations on one side and verify arrival on the other.
4. Toggle network state (off/on) on one device and watch reconnect behavior.
5. Trigger rest timer lifecycle transitions (start/background/foreground/stop).

## 8) Known issues & fixes

**Worklet timeout (12s) on Pixel 8 Pro (arm64):**
Root cause: bare-kit V8 pointer compression + 4GB cage reservation on arm64 with
`memoryLimit=0` auto-sizing from 12GB physical RAM. V8 isolate creation exceeds
the 12s `START_TIMEOUT_MS`.
Fix (applied in `src/sync/holepunchBridge.ts`):
- `new Worklet({ memoryLimit: 128 * 1024 * 1024 })` — caps V8 heap at 128MB
- `START_TIMEOUT_MS = 30000` — 30s timeout for worklet startup

**DHT bootstrap unreachable from emulator (SLIRP NAT):**
Emulator SLIRP NAT cannot reach public DHT bootstrap nodes (`bootstrap.dht.is`).
Use a physical device as one of the two peers, or set up a local DHT bootstrap
via `scripts/e2e/start-dht-bootstrap.mjs` and rebuild with
`EXPO_PUBLIC_E2E_DHT_BOOTSTRAP_HOST=<host-ip>`.

**Maestro `inputText` fails on physical device:**
React Native `TextInput` doesn't accept Maestro's `inputText` on some devices.
Workaround in join flow: set clipboard via `adb shell cmd clipboard set <invite>`,
then tap the Paste button (`sync.join.paste`). Also add `pressKey: Enter` after
weight input to commit the value, otherwise it's silently discarded.

**Maestro test limitations (to address):**
- `inputText` inconsistent across devices — use clipboard + paste where possible
- Keyboard covers submit buttons — add `hideKeyboard` or Back key before tapping
- Full sync flow requires manual steps on physical device unless clipboard set via adb
- Diagnostic capture flow (`sync-copy-debug-payloads.yaml`) fragile when app state unknown — needs navigation guard at start

## 9) Verified behavior

All features tested on Pixel 8 Pro (arm64, joiner) + x86_64 emulator (creator):

| Feature | Result | Mechanism |
|---------|--------|-----------|
| Device rename sync | ✅ | `device_profile` op propagates via autobase |
| Exercise weight sync | ✅ | `setExerciseWeight` mutation, 200ms debounce |
| Add exercise | ✅ | `addExercise` with synced exercise ID |
| Edit exercise | ✅ | `editExercise` mutation |
| Delete exercise | ✅ | `deleteExercise` mutation |
| Leave room | ✅ | Clears sync state, stops worklet |
| Rejoin same room | ✅ | Data intact, sync resumes |

| Edge case | Result | Behavior |
|-----------|--------|----------|
| Simultaneous writes | ✅ | Brief desync (orange dot), auto-recovers ~30s via DHT retry backoff |
| Offline mutation | ✅ | Queued locally, published on reconnect |
| Rapid mutations (5+) | ✅ | Coalesced — only last value per exercise sent |
| Airplane mode cycle | ✅ | Reconnects via exponential backoff [30,60,120,300,600]s |

## 10) Connection status

The header bar dot indicates sync health:
- **Green** (`synced` / `peer_connected`) — connection active
- **Orange** (`connecting` / `waiting`) — reconnecting (DHT retry in progress)
- **Red** (`error`) — check `lastError` in diagnostics

## 11) Sync architecture summary

**Steady state** (both `roomState: active`): all changes are incremental `SyncMutation`
ops. No full snapshots are sent after first-sync resolution.

`coalescePublishQueue` collapses redundant mutations (same-exercise weights,
same-workout reorders, week/day configs). Only the last value per entity is
published after the 200ms `PUBLISH_DEBOUNCE_MS`.

**Full snapshots** (`snapshot_replace`) only trigger on:
1. Creator publishes initial state on first-sync (`auto_publish_local`)
2. User resolves conflict as "local" or "merge"
3. Creator republishes when first peer connects

No size limits — a typical program (4-6 workouts, 12-20 exercises) stays under
50KB. Extreme programs (100+ exercises) have no explicit guardrail.

## 12) Remaining concerns

| Concern | Risk | Details |
|---------|------|---------|
| Publish loss on crash | Medium | When sync is active, mutations go to in-memory `pendingPublishQueue` (200ms debounce). If the app crashes between `enqueuePublish` and `flushPendingPublishes`, the mutation is applied locally but never synced to peers. The `sync_outbox` SQLite table exists but is only used when sync is inactive. |
| 3+ devices in same room | Low | Autobase supports multi-writer. `apply` acks all writers. Not tested with >2 peers. |
| Week/day config sync | Low | Uses `replaceWeekConfigs`/`replaceDayConfigs` mutations — same pipeline as other mutations. `shouldApplyConfigRevision` compares timestamps. Never triggered in live testing. |
| Conflict resolution UI | Low | The `requires_user_choice` path in `resolveFirstSync` and `tryEnterActiveConflict` is coded but never triggered manually on live devices. Only `auto_import_remote` and `auto_publish_local` were exercised. |

## 13) Signals to prioritize

- Sync lifecycle tags: `[pearlift-sync][dev:...][manager:*]`
- Bridge/runtime tags: `[pearlift-sync][dev:...][bridge:*]`
- Backend/worklet tags: `[pearlift-sync][dev:...][sync|publish|autobase|dial:*]`
- Timer/native warnings/errors under `RestTimer`, `BareKit`, `ReactNativeJS`

## 14) Quick reset if environment is stale

```bash
rtk adb kill-server
rtk adb start-server
rtk adb devices -l
```

If only one target appears, replug USB and re-run step 2.
