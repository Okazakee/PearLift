# PearLift Releasing

This is the only release checklist you need.

## Repo layout

- App repo: `~/Desktop/Projects/PearLift`
- F-Droid packaging repo: `~/Desktop/Projects/fdroiddata`

Do not keep a separate `fdroiddata` checkout inside `PearLift/`.

## Normal development

You can ship app commits whenever you want without triggering an F-Droid update.

Nothing reaches F-Droid users until you do all of these on purpose:

1. bump the app version
2. commit and push the app repo
3. create and push a new release tag
4. update the separate `fdroiddata` repo
5. open or update the `fdroiddata` merge request

## Release flow

### 0. Configure the Play upload key locally

For local signed release builds, provide the real Play upload key via environment variables.

Recommended: keep these in `.env.local`:

```bash
PEARLIFT_UPLOAD_STORE_FILE=/absolute/path/to/your-play-upload-key.jks
PEARLIFT_UPLOAD_STORE_PASSWORD=...
PEARLIFT_UPLOAD_KEY_ALIAS=...
PEARLIFT_UPLOAD_KEY_PASSWORD=...
```

Notes:

- PearLift does not generate or manage a separate repo-local production keystore anymore.
- F-Droid does not use your local signing key.
- Local release APK/AAB builds should use the actual Play upload key, supplied from secure local storage.

### 1. Bump the version

Run:

```bash
bun run version:bump
```

This updates:

- `package.json`
- `app.json`
- `fdroid-version.txt`

It does not commit, tag, push, or touch `fdroiddata`.

### 2. Verify the app repo

Run:

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run prebuild -- --clean --platform android
bun run android:release:apk
bun run android:release:aab
```

Outputs:

- APK: `android/app/build/outputs/apk/release/app-release.apk`
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`

If signing variables are missing, the Android release scripts will fail early.

### 3. Prepare the separate F-Droid repo

Run:

```bash
bun run fdroid:prepare
```

This updates:

- `~/Desktop/Projects/fdroiddata/metadata/dev.okazakee.pearlift.yml`

It syncs:

- `versionName`
- F-Droid split `versionCode`s
- `commit`
- `CurrentVersion`
- `CurrentVersionCode`

PearLift uses ABI split APKs on F-Droid. The app's base `versionCode` stays in
`app.json` and `fdroid-version.txt`; the F-Droid metadata derives APK-specific
codes from it:

- `armeabi-v7a`: `baseVersionCode * 100 + 1`
- `arm64-v8a`: `baseVersionCode * 100 + 2`

It does not commit or push anything.

If your `fdroiddata` repo lives somewhere else, override it with:

```bash
PEARLIFT_FDROIDDATA_DIR=/path/to/fdroiddata bun run fdroid:prepare
```

### 4. Commit and tag the app release

Run:

```bash
git status
git add package.json app.json fdroid-version.txt
git commit -m "Release X.Y.Z"
git push
git tag vX.Y.Z
git push origin vX.Y.Z
```

Replace `X.Y.Z` with the new version.

### 5. Commit the F-Droid metadata update

In `~/Desktop/Projects/fdroiddata`:

```bash
git status
git add metadata/dev.okazakee.pearlift.yml
git commit -m "Update PearLift to X.Y.Z"
git push
```

Then open or update the F-Droid merge request and wait for CI.

## F-Droid pipeline notes

The build recipe lives in `~/Desktop/Projects/fdroiddata/metadata/dev.okazakee.pearlift.yml`
and is maintained by hand (the `fdroid:prepare` script does not touch the `prebuild` or `build`
sections — only version numbers and commit hashes).

Current pipeline flow inside the F-Droid build server:

1. `sudo`: install npm + bun from Debian repo
2. `prebuild`:
   - `bun install --frozen-lockfile`
   - strip stray nested `node_modules` in the rest-timer module
   - patch `JavaVersion.VERSION_17` → `VERSION_21` and `jvmToolchain(17)` → `jvmToolchain(21)` in the RN gradle plugin (F-Droid servers only have JDK 21; the plugin hardcodes JDK 17 for toolchain alignment, which fails without this sed)
   - `bunx expo prebuild -p android --clean`
3. `build`: `gradle assembleRelease` with ABI splits and arch flags

The combined sed keeps Java and Kotlin targets aligned at 21 everywhere — splitting
them (e.g., skipping alignment via `react.internal.disableJavaVersionAlignment`)
causes Java/Kotlin target mismatches in library modules that default to Java 1.8.

This recipe produces two APKs per release — one per ABI — with version codes
`baseVersionCode * 100 + 1` (armeabi-v7a) and `baseVersionCode * 100 + 2` (arm64-v8a).

When patching the recipe after an RN upgrade, always re-verify:

- the `JavaVersion\|jvmToolchain` sed targets still match the plugin files
- the JdkConfiguratorUtils.kt path hasn't moved
- `notify-kit` hasn't added a `jvmToolchain` call (currently it uses `jvmTarget`/`JavaVersion` only, which JDK 21 handles natively)

## Future update rule

If you want to keep developing without publishing to F-Droid yet:

- do not run `version:bump`
- do not change `fdroid-version.txt`
- do not create a new tag
- do not update `fdroiddata`

App commits alone do not trigger an F-Droid update.

## Android permissions and policy notes

Current Android release behavior uses:

- Camera: scan backup QR codes
- Notifications: local rest timer completion notifications
- Foreground service: keep Android rest timers alive in background
- Wake lock: prevent timer interruption while the foreground timer service is active

Current privacy posture:

- no account required
- workout data stays on-device by default
- no ads
- no analytics or tracking SDKs
- no Firebase or Google Play Services dependency

## Keep these docs

- `docs/md/RELEASING.md`
- `docs/md/STORE_METADATA.md`
- `docs/md/ASSET_PROVENANCE.md`
