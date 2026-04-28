# PearLift

PearLift is a local-first, privacy-focused workout tracker built with Expo and React Native. It focuses on fast workout logging, progressive overload, resilient rest timers, and user-controlled local backups.

## Highlights

- Multi-day workout programs with reordering and structured progression
- Weight tracking with kg/lb support and automatic overload adjustments
- Android background rest timer support through a local foreground-service module
- Local backup export/import and QR-based device transfer
- No account required
- No proprietary analytics, ads, or tracking SDKs

## Development

```bash
git clone https://github.com/Okazakee/PearLift.git
cd PearLift
bun install
bun run start
```

Useful commands:

- `bun run android`
- `bun run ios`
- `bun run lint`
- `bun run typecheck`
- `bun run site:preview`

## Android release flow

```bash
bun run prebuild -- --clean --platform android
bun run android:release:apk
bun run android:release:aab
```

Release and store documentation:

- [Android release guide](./docs/ANDROID_RELEASE.md)
- [Store metadata](./docs/STORE_METADATA.md)
- [Asset provenance](./docs/ASSET_PROVENANCE.md)

## Privacy and support

- Privacy policy source: [site/privacy/index.html](./site/privacy/index.html)
- Support / issue tracker: `https://github.com/Okazakee/PearLift/issues`
- Source repository: `https://github.com/Okazakee/PearLift`

## License

PearLift is licensed under the [MIT License](./LICENSE).
