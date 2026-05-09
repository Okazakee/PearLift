# SDK 56 Upgrade Notes

> Source: https://expo.dev/changelog/sdk-56-beta
> Current: SDK 55 / RN 0.83.6 / React 19.2.0 / TS ~5.9.2

---

## Upgrade Command

```bash
bunx expo install expo@^56.0.0 --fix
```

Then run:

```bash
bunx expo-codemod sdk-56-expo-router-react-navigation-replace src
```

---

## Breaking Changes to Handle

### 1. `expo/fetch` becomes `globalThis.fetch`
- Remove any `import { fetch } from 'expo/fetch'` — it's now the default.
- To opt out: set `EXPO_PUBLIC_USE_RN_FETCH=1` in `.env`.

### 2. `expo-file-system`: async `copy()` and `move()`
- `copy()` and `move()` on `File`/`Directory` are now async (return a Promise).
- If you need sync, use `copySync()` / `moveSync()`.
- Search codebase for `.copy(` and `.move(` calls in:
  - `src/storage/` (SVG caching)
  - Holepunch bridge (P2P backend bundle storage)
  - Workout export

### 3. iOS deployment target bumped to 16.4
- Update any custom podspec to `s.platforms = { :ios => '16.4' }`.
- Drops iPhone 7/7+, 6s/6s+, SE 1st gen, iPad mini 4, iPad Air 2.

### 4. Xcode minimum bumped to 26.4
- Ensure CI runners + local dev machines have Xcode 26.4+.

### 5. TypeScript 6.0.3
- `bunx expo install --fix` will pull it in.
- Opt out: add `"typescript"` to `expo.install.exclude` in `package.json`.

### 6. `@expo/vector-icons` → `@react-native-vector-icons/*`
- Run: `bunx @react-native-vector-icons/codemod`

---

## Performance (No Code Changes Needed — Free Wins)

| Change | Impact |
|---|---|
| Kotlin compiler plugin | ~40% faster Android cold starts, 33% faster first render |
| Hermes V1 default | Faster startup, less memory |
| New iOS JSI layer (Swift→JSI direct) | Faster native module calls |
| Precompiled XCFrameworks | Faster iOS builds (local + EAS) |
| Native Node.js watcher | Faster Metro bundler startup |

---

## Packages to Update / Migrate

### `expo-av` → `expo-audio`
The new `expo-audio` has a `useAudioStream` hook (real-time mic buffer). Check `src/utils/timerAudio.ts` — consider migrating from `expo-av` Audio APIs to `expo-audio`.

### `expo-file-system` new features to adopt
- `File.downloadFileAsync()` now supports progress + `AbortSignal`
- `File.createUploadTask()` / `File.createDownloadTask()` — resumable long transfers
- `File.watch()` / `Directory.watch()` — file change subscriptions
- `File.pickFileAsync()` now supports multi-file + multi-MIME
- Check usage in: `src/` (workout export), holepunch bridge, SVG caching

### `expo-sqlite` new features
- Native `ArrayBuffer` for blob columns (replaces `JavaScriptArrayBuffer`)
- Statement bind params + session changesets
- Check usage in: `src/storage/database.ts`, `src/storage/workoutRepository.ts`

### `expo-status-bar`
- New `<StatusBar style="auto" hidden={false} />` declarative API
- New config plugin for `app.json`
- Update `src/screens/WorkoutScreen.tsx`

### `expo-haptics`
- Web haptics now work on Safari (minor — iOS/Android already covered)

---

## Native Module: `pearlift-rest-timer-fgs`

### Consider converting to inline module
Inline modules let you define native modules directly in the project (no separate package). Would simplify `modules/pearlift-rest-timer-fgs/`.

See: https://docs.expo.dev/modules/inline-modules-reference/

### New `create-expo-module` tool
- `addPlatformSupport` subcommand to add a platform to an existing module
- Good for if you ever want to add iOS support to the foreground service module

---

## New Stuff Worth Exploring

### Expo UI (production-ready)
Universal cross-platform components: `Button`, `Switch`, `Slider`, `Checkbox`, `BottomSheet`, etc.
Drop-in replacements for `@gorhom/bottom-sheet`, `@react-native-community/datetimepicker`, etc.
Could simplify UI components if you're using any of those community libs.

### Brownfield: Multiple isolated apps
If you ever embed PearLift into another app, `expo-brownfield` now supports multiple frameworks side by side with no symbol collisions.

---

## Deprecations
- Legacy `expo-calendar`, `expo-contacts`, `expo-media-library` APIs — replaced by object-oriented `-next` variants (not used in PearLift currently)
- `@expo/vector-icons` → superseded by `@react-native-vector-icons/*`

---

## Testing Checklist
- [ ] Run `bunx expo install expo@^56.0.0 --fix`
- [ ] Run the codemod
- [ ] `bunx expo prebuild --clean` && `bunx expo run:ios` && `bunx expo run:android`
- [ ] Test timer alarm audio (expo-av / expo-audio)
- [ ] Test workout export + file sharing (expo-file-system async copy/move)
- [ ] Test SQLite database operations
- [ ] Test foreground service (pearlift-rest-timer-fgs) on Android
- [ ] Test P2P sync (holepunch bridge file operations)
- [ ] Test biometric auth (expo-local-authentication)
- [ ] EAS Build: iOS + Android
- [ ] Verify cold start time improvement on Android
