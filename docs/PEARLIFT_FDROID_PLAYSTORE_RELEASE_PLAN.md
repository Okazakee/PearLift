# PearLift Play + F-Droid Release Notes

This directory is intentionally limited to publication material.

## Current store strategy

- One Android package name: `dev.okazakee.pearlift`
- One feature set where possible
- No Play/F-Droid flavor split unless a store constraint forces it
- Publish the current Expo-based app before any larger sync/runtime expansion

## Current status

Validated release flow:

- clean Android prebuild
- signed release APK build
- signed release AAB build

Main operational requirements remaining outside the code build itself:

- deploy the production website and privacy page
- finalize store listing text and screenshots
- submit the repo metadata to F-Droid

## Store-specific notes

### Google Play

- Upload the signed `.aab`
- Complete Data safety and other Play Console declarations
- Use the production privacy policy URL from the public website

### F-Droid

- Build from source using the documented clean release flow
- Use the release/store docs in this directory as the submission reference set
- Provide the source repo, issue tracker, privacy policy URL, and license details from the repo

## Related files

- [ANDROID_RELEASE.md](./ANDROID_RELEASE.md)
- [STORE_METADATA.md](./STORE_METADATA.md)
- [ASSET_PROVENANCE.md](./ASSET_PROVENANCE.md)
