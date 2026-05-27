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

## 3) Start app dev flow once

```bash
rtk bun run start
```

## 4) Build/install to each target

Run this twice and select a different target each time:

```bash
rtk npx expo run:android --device
```

## 5) Capture logs in parallel

Terminal A (emulator):

```bash
rtk sh -lc 'adb -s emulator-5554 logcat -v threadtime | rg "pearlift-sync|ReactNativeJS|RestTimer|BareKit"'
```

Terminal B (phone):

```bash
rtk sh -lc 'adb -s <PHONE_SERIAL> logcat -v threadtime | rg "pearlift-sync|ReactNativeJS|RestTimer|BareKit"'
```

## 6) Repro sequence to run while both logs are active

1. Launch both app instances.
2. Start/join same sync room.
3. Make workout mutations on one side and verify arrival on the other.
4. Toggle network state (off/on) on one device and watch reconnect behavior.
5. Trigger rest timer lifecycle transitions (start/background/foreground/stop).

## 7) Signals to prioritize

- Sync lifecycle tags: `[pearlift-sync][dev:...][manager:*]`
- Bridge/runtime tags: `[pearlift-sync][dev:...][bridge:*]`
- Backend/worklet tags: `[pearlift-sync][dev:...][sync|publish|autobase|dial:*]`
- Timer/native warnings/errors under `RestTimer`, `BareKit`, `ReactNativeJS`

## 8) Quick reset if environment is stale

```bash
rtk adb kill-server
rtk adb start-server
rtk adb devices -l
```

If only one target appears, replug USB and re-run step 2.
