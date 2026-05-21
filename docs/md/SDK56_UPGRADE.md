# SDK 56 Upgrade Notes

> Source: https://expo.dev/changelog/sdk-56
> Current: SDK 56 / RN 0.85.3 / React 19.2.3 / TS ~6.0.3

---

## Applied Upgrade

```bash
bunx expo install expo@^56.0.0 --fix --bun
bunx expo install expo-audio expo-navigation-bar --bun
bun remove expo-av
```

The Expo Router / React Navigation codemod was intentionally skipped because
PearLift does not use `expo-router` or `@react-navigation/*`.

The vector-icons codemod was intentionally skipped because PearLift does not use
`@expo/vector-icons`.

---

## Breaking Changes Handled

### 1. `expo/fetch` becomes `globalThis.fetch`
- No PearLift source imports `expo/fetch`, so no code change was required.
- To opt out if needed later: set `EXPO_PUBLIC_USE_RN_FETCH=1` in `.env`.

### 2. `expo-file-system`: async `copy()` and `move()`
- No PearLift source calls `File.copy()`, `Directory.copy()`,
  `File.move()`, or `Directory.move()`.
- SVG caching now passes an `AbortSignal` to `File.downloadFileAsync()`.

### 3. iOS deployment target bumped to 16.4
- PearLift uses CNG; `ios/` is generated and ignored.
- Any future custom iOS Expo module podspec must use
  `s.platforms = { :ios => '16.4' }`.
- This drops iPhone 7/7+, 6s/6s+, SE 1st gen, iPad mini 4, and iPad Air 2.

### 4. Xcode minimum bumped to 26.4
- Local iOS builds and CI runners need Xcode 26.4+.
- EAS Build profiles without a pinned image default to the SDK 56 image.

### 5. TypeScript 6.0.3
- `expo install --fix` upgraded TypeScript to `~6.0.3`.

### 6. `expo-av` removed
- Timer completion audio now uses `expo-audio`.
- The `expo-audio` config plugin disables microphone recording and background
  playback permissions because PearLift only plays a short foreground timer
  completion sound.

---

## SDK 56 Optimizations Adopted

| Change | PearLift state |
|---|---|
| Hermes V1 default | Adopted through SDK 56 / RN 0.85 |
| Expo Modules Android compiler plugin | Adopted through SDK 56 |
| iOS precompiled Expo packages | Default, no app config required |
| Android precompiled headers | Enabled with `expo-build-properties.android.usePrecompiledHeaders` |
| Status/navigation bar component parity | `StatusBar` and `NavigationBar` are rendered declaratively |
| Native Node.js watcher / on-demand filesystem | Default Expo CLI behavior |

If Android CMake fails specifically from `usePrecompiledHeaders`, revert only
that flag to `false` and document the failing package.

---

## Testing Checklist

- [ ] `bun run lint`
- [ ] `bun run typecheck`
- [ ] `bunx expo-doctor@latest`
- [ ] `bun run bundle:sync-backend`
- [ ] `bunx expo prebuild --clean`
- [ ] `bun run android`
- [ ] Test timer alarm audio and haptics
- [ ] Test workout export, file sharing, and JSON import
- [ ] Test SQLite database operations
- [ ] Test foreground service on Android
- [ ] Test P2P sync via Holepunch
- [ ] Test biometric auth
- [ ] EAS Build: iOS + Android
