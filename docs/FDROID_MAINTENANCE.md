# PearLift F-Droid / Play Maintenance Guide

This doc is the checklist to ship updates without breaking the F-Droid build or store compliance.

## Ground Rules (Do Not Break These)

- Keep releases **tagged** (`vX.Y.Z`). F-Droid update checks rely on tags.
- Keep `fdroid-version.txt` updated for every release.
- Keep store text and screenshots in the upstream **Fastlane** structure:
  - `fastlane/metadata/android/en-US/short_description.txt`
  - `fastlane/metadata/android/en-US/full_description.txt`
  - `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`
  - `fastlane/metadata/android/en-US/images/phoneScreenshots/*.png`
- Do not add long descriptions to `fdroiddata` MR bodies or `metadata/*.yml` `Description:` fields. Reviewers prefer pulling metadata from `fastlane/`.
- Do not commit keystores to git. F-Droid signs builds with their own key; Play uses your upload key.

## Release Checklist (Every Version)

1. Bump app version
   - Update your app’s versionName/versionCode in the repo (wherever your Android build reads them).
   - Update `fdroid-version.txt` to match the release:
     - `versionCode=<INTEGER>`
     - `versionName=<X.Y.Z>`

2. Update store text/assets
   - Update `fastlane/metadata/android/en-US/short_description.txt` if needed.
   - Update `fastlane/metadata/android/en-US/full_description.txt` if needed.
   - Add `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`.
   - Update screenshots under `fastlane/metadata/android/en-US/images/phoneScreenshots/` as needed.
   - Keep the privacy policy page live at a stable URL (and keep wording consistent with app behavior).

3. Verify local clean Android builds
   - Run the clean flow from a fresh clone when possible:
     - `bun install`
     - `bun run prebuild -- --clean --platform android`
     - `bun run android:release:apk`
     - `bun run android:release:aab`

4. Tag and push
   - Commit release changes in the app repo.
   - Create tag `vX.Y.Z` and push it.

## F-Droid Update Checklist (fdroiddata MR)

F-Droid builds from source on a hardened buildserver. The fdroiddata recipe must remain reproducible.

When you update:

1. Update the build entry (usually a new MR per version)
   - `versionName`: `X.Y.Z`
   - `versionCode`: integer
   - `commit`: **full git SHA** for the tag you released (not `vX.Y.Z`)

2. Keep Hermes working
   - If the app uses Hermes (recommended), do **not** delete Linux `hermesc` from `node_modules`.
   - In fdroiddata metadata, `scanignore` should include the Linux `hermesc` binary path so scanners don’t fail on it.

3. Avoid “variant not found”
   - If you do not define an `fdroid` flavor/variant, do not build `:app:assembleFdroid`.
   - Build `:app:assembleRelease` and set `output:` to the corresponding release APK path.

4. Java/Gradle toolchains
   - F-Droid buildserver currently uses Java 21 as system Java.
   - If Gradle/RN requires Java 17 toolchains, the fdroiddata build recipe may need to provide a JDK17 and point Gradle at it via:
     - `org.gradle.java.installations.paths=...`
   - Do not rely on Debian packages for Java 17 in the buildserver image.

5. Scanner hygiene
   - Prefer `scanignore` for specific build scripts known to cause false positives.
   - Use `scandelete` only when necessary, and avoid deleting files that your build actually needs.
   - If you change dependencies and CI fails on scanning, update `scanignore/scandelete` minimally and document the reason in the MR.

## “Do Not Do This” (Common Breakages)

- Don’t reference tags in fdroiddata `commit:`. Use the full SHA.
- Don’t put multiline shell scripts in fdroiddata `build:` using YAML blocks that `rewritemeta` can rewrite in surprising ways. Prefer single-line steps.
- Don’t delete the Linux Hermes compiler binary if Hermes is enabled.
- Don’t assume `android/gradlew` exists in F-Droid CI. Build recipes should use the buildserver’s Gradle wrapper helper (`gradlew-fdroid`) if required.

## Troubleshooting (Fast Pattern)

When an fdroiddata pipeline fails, always focus on the *first* real error:

- `fdroid rewritemeta`:
  - It’s a formatting failure. Make your metadata match the diff output exactly.
- `fdroid build`:
  - Look for the first `FAILURE:` block and the exact command it ran.
  - Fix one root cause per commit/MR update, then re-run CI.

## Compliance Notes (Keep Claims True)

- If you say “no analytics / no tracking / no ads”, verify dependencies remain consistent with that claim.
- If you request permissions (camera, notifications, etc.), keep the privacy policy and store listing consistent with actual behavior.
- Avoid bundling proprietary services that would violate F-Droid inclusion criteria.

