# PearLift F-Droid + Play Store Release Architecture

## Summary
Goal: ship and maintain PearLift on **both Google Play Store and F-Droid** from one codebase, with predictable builds and store-compliant behavior.
Chosen defaults for v1:
- Distribution model: **Two Android flavors** (`play`, `fdroid`) from the same app code
- Packaging model: **Separate application IDs** to avoid signing/update collisions between stores
- Compliance baseline date: **April 18, 2026**

System split:
- **Play flavor:** optimized for Play requirements, Play App Signing flow, and Play metadata/review lifecycle
- **F-Droid flavor:** reproducible, fully open-source build path with no proprietary runtime requirements

## Key Corrections and Decisions
- Do **not** treat “Android build” as one target; store policy and signing requirements differ materially.
- Keep a single product surface, but isolate store-specific behavior via build flavor flags.
- Lock current mandatory policy targets in code/config:
  - Play submissions must use Android App Bundle (`.aab`) for new apps.
  - Play target API must satisfy current requirement windows.
  - F-Droid flavor must remain fully FLOSS in source, dependencies, and build tooling.
- Decide and lock package strategy:
  - `com.okazakee.pearlift` for Play
  - `com.okazakee.pearlift.fdroid` for F-Droid
- Disable or replace any proprietary-only dependency in F-Droid builds (including update/telemetry paths).
- Use strict semantic versioning + monotonic Android `versionCode` strategy per flavor.
- Play signing and F-Droid signing are independent; release/update compatibility must be documented explicitly.

## Implementation Changes
- **Build System / Flavors**
  - Add Android product flavors (`play`, `fdroid`) with per-flavor `applicationId`, app name suffix, and manifest placeholders.
  - Add shared and per-flavor build configs (`BuildConfig`/env bridge) for URLs, feature flags, and policy toggles.
  - Add CI matrix build (`playRelease`, `fdroidRelease`) with artifact naming and checksum generation.
  - Enforce release artifact type checks:
    - `play`: generate/sign/upload `.aab`
    - `fdroid`: reproducible APK output path from source build instructions

- **Dependency and Runtime Compliance**
  - Audit dependencies for non-free/proprietary SDKs.
  - For `fdroid` flavor:
    - remove or stub proprietary services
    - disable proprietary OTA/update channels unless self-hosted and FOSS-compliant
    - ensure no runtime hard dependency on Google Play Services
  - For `play` flavor:
    - keep Play-compatible integrations only where policy-compliant and declared.
  - Explicitly forbid proprietary analytics/ads/tracking SDKs in `fdroid` flavor (including GMS/Firebase/Crashlytics style dependencies).

- **Signing and Release Management**
  - Configure Play upload key + Play App Signing workflow (new Play apps use Play App Signing flow).
  - Configure deterministic local release signing for developer artifacts used in reproducibility checks.
  - Document F-Droid signing expectation (F-Droid repository signatures) and user migration constraints.
  - Add release script to bump `version`/`versionCode` safely for both flavors.
  - Add immutable policy checks in CI:
    - Play `targetSdkVersion >= 35` (for phone/tablet baseline)
    - Wear/TV/Automotive exceptions handled only if those variants exist
    - monotonic versionCode per published track/flavor

- **Privacy, Legal, and Store Metadata**
  - Add in-app links and hosted documents:
    - Privacy Policy
    - Terms (if required by selected features)
    - Contact/support email
  - Prepare Play Console declarations:
    - Data safety form
    - Content rating
    - target audience / app access / ads declaration (as applicable)
    - ensure declarations reflect actual runtime behavior per flavor
  - Prepare F-Droid metadata set:
    - app description/changelog
    - source repo and build instructions
    - anti-feature declarations if any remain
  - Include fastlane/triple-t style metadata assets required by F-Droid submission workflow.

- **Security and Network Posture**
  - Add network security config and HTTPS-only endpoint policy.
  - Gate diagnostics/logging by build type and strip sensitive logs from release.
  - Validate exported activities/services/providers and tighten manifest permissions.
  - Ensure no silent executable code downloads or self-update mechanism in F-Droid flavor without explicit informed opt-in constraints.

- **Quality and Delivery Pipeline**
  - Add mandatory release gates:
    - lint/typecheck/tests
    - Android release build for both flavors
    - smoke install on clean emulator/device
    - policy assertions (artifact type, target SDK, flavor dependency allowlist)
  - Add changelog/release notes generation in CI.
  - Add rollback procedure and hotfix path per store.
  - Add recurring compliance review task (monthly) to detect store policy changes.

## Public Interfaces / Config Surfaces
- `StoreFlavorConfig`
  - `flavor`, `applicationId`, `displayName`, `allowProprietaryServices`, `updateChannel`, `store`
- `ReleaseVersionConfig`
  - `versionName`, `versionCodePlay`, `versionCodeFdroid`, `targetSdk`
- `LegalConfig`
  - `privacyPolicyUrl`, `supportEmail`, `sourceCodeUrl`
- `ComplianceConfig`
  - `playRequiresAab`, `playMinTargetSdk`, `fdroidFlossOnly`, `fdroidAllowTrackingDefaultOff`
- Scripts/contracts:
  - `release:android:play`
  - `release:android:fdroid`
  - `verify:reproducible:fdroid`
  - `validate:store-metadata`
  - `validate:store-compliance`

## Test Plan
- **Flavor correctness**
  - `play` and `fdroid` builds compile/install/run with expected app IDs and labels.
  - flavor flags correctly enable/disable store-specific features.
- **Policy compliance**
  - Play upload candidate uses `.aab`.
  - Play target API checks pass against current policy baseline (`targetSdk >= 35` for standard Android app).
  - Play Data safety declarations are audited against actual data collection in code and network paths.
  - Play pre-launch report passes critical checks.
  - F-Droid build works from source with documented commands and no missing proprietary deps.
  - F-Droid dependency scan confirms no non-FLOSS/proprietary tracking SDKs.
  - F-Droid anti-feature state is explicit and consistent with behavior.
- **Signing and updates**
  - Play internal track update path works across version increments.
  - F-Droid update path works from repository channel.
  - Cross-store migration behavior is documented and verified (clean install vs migrate flow).
- **Privacy/security**
  - release builds contain no debug logs/secrets.
  - privacy links and required declarations are visible and accurate.
- **Regression**
  - backup/import/export and workout flows unchanged across flavors.

## Assumptions
- Android is the first dual-store target; iOS distribution is out of scope for this plan.
- Current architecture remains local-first; this plan focuses on release/compliance hardening.
- No mandatory proprietary SDK is required for core workout functionality.
- If a proprietary integration becomes required later, it must be flavor-gated and excluded from `fdroid` builds.
- Compliance references this plan is aligned to (checked April 18, 2026):
  - Google Play target API requirement page (Android Developers)
  - Android App Bundle requirement page (Android Developers)
  - Play data use/Data safety guidance (Android Developers)
  - F-Droid Inclusion Policy, Inclusion How-To, and Anti-Features docs
