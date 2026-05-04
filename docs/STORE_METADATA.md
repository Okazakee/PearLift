# PearLift Store Metadata

This file is the copy reference for store listings and MR text.

Canonical store assets still live in:

- `fastlane/metadata/android/...`

## Canonical URLs

- Source repository: `https://github.com/Okazakee/PearLift`
- Issue tracker / support: `https://github.com/Okazakee/PearLift/issues`
- Production website: `https://pearlift.okazakee.dev/`
- Production privacy policy: `https://pearlift.okazakee.dev/privacy/`

## Short summary

Privacy-focused local workout tracker with rest timers, overload, and local backups.

## Full description

PearLift is a local-first workout tracker built for lifters who want fast logging without accounts or cloud lock-in.

Key points:

- Create and organize multi-day workout programs
- Track sets, reps, load, and progressive overload
- Run resilient rest timers that continue working on Android in the background
- Export or restore your data with local backup files
- Transfer backups between devices with QR-based sharing
- Use the app without creating an account

Privacy posture:

- all workout data stays on your device by default
- no ads
- no analytics or tracking SDKs
- no Firebase or Google Play Services dependency

## Release note template

Use this pattern for Play notes, GitHub releases, and F-Droid changelog text:

```text
PearLift X.Y.Z

- Added:
- Changed:
- Fixed:
- Build / release notes:
```

## F-Droid submission notes

Current repo posture:

- buildable from source with the release flow in `docs/RELEASING.md`
- fully FLOSS dependency posture for the current app stack
- no anti-feature declaration expected from current dependency set

F-Droid listing references:

- Source code: `https://github.com/Okazakee/PearLift`
- Issue tracker: `https://github.com/Okazakee/PearLift/issues`
- License: MIT
- Privacy policy: production privacy URL above
