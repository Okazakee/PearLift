# PearLift Android Release Guide

PearLift is released from the main app package:

- Android package: `dev.okazakee.pearlift`
- Source repository: `https://github.com/Okazakee/PearLift`
- Support and issue tracker: `https://github.com/Okazakee/PearLift/issues`

## Release baseline

Current release flow is validated from a clean Android prebuild:

```bash
bun install
bun run prebuild -- --clean --platform android
bun run android:release:apk
bun run android:release:aab
```

F-Droid builders or environments without Bun can use the npm equivalent:

```bash
npm install
npx --yes expo prebuild --clean --platform android
./scripts/build-android-apk.sh
```

Outputs:

- APK: `android/app/build/outputs/apk/release/app-release.apk`
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`

## Prerequisites

- Node.js 20+
- Bun 1.3+
- JDK with `keytool`
- Android SDK and NDK as required by Expo SDK 55 / React Native 0.83

## Signing

Generate a local release keystore:

```bash
bun run android:keygen
```

This creates:

- local keystore under `.local/keystores/`
- `.env.local` with signing variables
- `android/keystore.properties` when `android/` already exists

Release builds fail early if:

- the keystore file is missing
- the store password is wrong
- the key alias is missing
- the key password is wrong

If the app has not been published yet and the local keystore is stale, you can replace it with:

```bash
PEARLIFT_FORCE_KEYSTORE_RECREATE=1 bun run android:keygen
```

Do not replace the keystore after publication unless you intentionally want to break update continuity.

## Store artifacts

- Google Play target artifact: signed `.aab`
- F-Droid target artifact: source-built APK (built via `assembleFdroid`, then signed by F-Droid)

## Permission summary

Current Android release behavior uses:

- Camera: scan backup QR codes
- Notifications: rest timer completion and background timer notifications
- Foreground service: keep Android rest timers alive in background
- Wake lock: prevent timer interruption while the foreground timer service is active

Blocked legacy storage permissions:

- `android.permission.READ_EXTERNAL_STORAGE`
- `android.permission.WRITE_EXTERNAL_STORAGE`

## Privacy behavior summary

- No account is required
- Workout data is stored locally on device
- No proprietary analytics, ads, or tracking SDKs are included
- No Firebase, Google Play Services, Crashlytics, or ad SDKs are used
- Backup export/import is user-initiated
- QR transfer is device-to-device and initiated by the user

## Submission readiness checklist

- Run `bun run lint`
- Run `bun run typecheck`
- Build APK and AAB from the clean flow above
- Smoke-test the release APK on device
- Confirm store text matches actual app behavior
- Confirm privacy policy is deployed at the production website before store submission
