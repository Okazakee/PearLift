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

### 3. Prepare the separate F-Droid repo

Run:

```bash
bun run fdroid:prepare
```

This updates:

- `~/Desktop/Projects/fdroiddata/metadata/dev.okazakee.pearlift.yml`

It syncs:

- `versionName`
- `versionCode`
- `commit`
- `CurrentVersion`
- `CurrentVersionCode`

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

- `docs/RELEASING.md`
- `docs/STORE_METADATA.md`
- `docs/ASSET_PROVENANCE.md`
