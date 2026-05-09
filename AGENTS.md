## 1. Overview

PearLift is a local-first, privacy-focused workout tracker built with Expo and React Native. The app supports multi-day workout programs, weight tracking with kg/lb support, Android background rest timers, local backup with QR-based device transfer, and peer-to-peer device sync via Holepunch. The primary language is TypeScript with Expo SDK 55. There is no backend server — sync uses a bundled Node.js backend running on-device through react-native-bare-kit.

## 2. Repository Structure

```
App.tsx                      # Root component — font loading, providers, entry point
index.ts                     # Expo registerRootComponent bootstrap
src/
  animation/                 # Reanimated motion primitives and hooks
  backup/                    # Local backup export/import and QR codec
  components/                # Shared UI components
    modals/                  # Full-screen and bottom-sheet modal components
  config/                    # App config (name, version, build info) and constants
  data/                      # Default workout programs and seed data
  hooks/                     # Shared React hooks (useResponsiveLayout, useCachedSvg)
  i18n/                      # Internationalization (i18next setup, system language)
  native/                    # Native module wrappers (notifications, foreground service)
  screens/                   # Screen-level components
  storage/                   # SQLite database, repository layer, and storage types
  store/                     # Zustand store (global state, sync orchestration)
  sync/                      # Peer-to-peer sync subsystem (bridge, encoding, manager)
  theme/                     # Design tokens (colors, spacing, typography)
  types/                     # Shared domain types and ambient declarations
  utils/                     # Pure utility functions (math, arrays, errors, timer)
backend/                     # Bare-rpc sync backend (runs on-device via bare-kit)
modules/                     # Local Expo native modules (e.g., rest-timer-fgs)
scripts/                     # Build, release, and dev scripts (invoked via npm scripts)
plugins/                     # Expo config plugins (abi splits, sync backend bundling)
assets/                      # Static assets (images, fonts)
docs/                        # Project documentation (privacy policy, release guide)
fastlane/                    # Fastlane metadata for app store submissions
android/                     # Android native project files
ios/                         # iOS native project files
```

- New components go in `src/components/`; modal components in `src/components/modals/`.
- New domain types go in `src/types/` or `src/storage/types.ts` for storage-related types.
- Shared utility functions go in `src/utils/`.
- Native module wrappers go in `src/native/`.
- Dev-only scripts go in `scripts/` and are never imported from `src/`.
- The `src/sync/sync.bundle.mjs` file is a build artifact — never edit it directly.

## 5. Commands and Workflows

### Package manager

Bun is the canonical package manager. The lockfile is `bun.lock`.

```bash
bun install           # install dependencies
```

### Dev

```bash
bun run start         # start Expo dev client (includes sync backend bundle step)
bun run android       # run on Android device/emulator
bun run ios           # run on iOS device/emulator
```

### Lint and typecheck

```bash
bun run lint          # biome check . (read-only)
bun run typecheck     # tsc --noEmit
bun run check:full    # both lint then typecheck
```

### Format

```bash
bun run format        # biome format --write .
bun run check         # biome check --write . (format + lint fix)
```

### Build and release

```bash
bun run android:release:apk   # build release APK
bun run android:release:aab   # build release AAB
bun run bundle:sync-backend    # rebuild sync backend bundle (with --force)
bun run version:bump           # bump version across all files
bun run fdroid:prepare         # prepare F-Droid source archive
```

### Pre-commit / pre-push hooks

Husky enforces:
- `pre-commit`: `bun run lint` — must pass before commit
- `pre-push`: `bun run typecheck` — must pass before push

### MCP tools

The following MCP servers are configured in `opencode.json`:

- **context7**: Use to search current documentation for Expo, React Native, Biome, Reanimated, Bare Kit, Holepunch, Zustand, or any other dependency. Always prefer this over training-data knowledge when unsure about an API.
- **gh_grep**: Use to find real-world usage examples from GitHub repositories when documentation is sparse (e.g., `bare-rpc`, `hyperswarm`, `autobase`, `react-native-bare-kit`).

## 6. Code Formatting

> **Repo-wide:** Biome is configured as the formatter and linter. Config lives at `biome.json`. Always generate code that matches these conventions — do not rely on biome to fix formatting after the fact.

### TypeScript / TSX

| Item | Convention |
|------|-----------|
| Indentation | 2 spaces |
| Line length | p95 is 67 chars; hard wrap at ~80 |
| Blank lines — top-level | 1 blank line between top-level function/class/export definitions |
| Blank lines — methods | 1 blank line between methods inside a class |
| Blank lines — after imports | 0 or 1 blank line between last import and first definition |
| Trailing newline | Always 1 trailing newline at end of file |
| Trailing whitespace | Never present |
| Quote style | Single quotes (`'`) |
| Semicolons | Always at end of statements |
| Braces — functions | Opening brace on same line |
| Braces — control flow | Opening brace on same line |
| Braces — JSX/TSX | Opening brace on same line for components, same line for ternaries |
| Spacing — operators | Space around `=` in assignments and around binary operators: `const x = 1` |
| Spacing — inside brackets | No spaces inside parens: `f(x)` not `f( x )` |
| Spacing — after commas | Space after comma: `import { a, b }` |
| Spacing — colons in types | Space after colon in type annotations: `key: string` |
| Trailing commas | Present in multi-line structures (objects, arrays, function params, imports) |
| Line continuation | Implicit via open bracket — never backslash |
| Import style | One import per line for type imports; named imports grouped on one line |

**Real snippet — import block:**

```typescript
import { type ReactNode, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MOTION } from '../animation/motion';
import {
  AnimatedFadeInView,
  AnimatedSlideInRightView,
  AnimatedSlideInView,
} from '../animation/primitives';
```

**Real snippet — component structure:**

```typescript
const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightPanelSheet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
  },
});
```

### JavaScript (.mjs, .js)

Same conventions as TypeScript: 2-space indent, single quotes, semicolons always. JavaScript files use `let`/`const` (no `var`). Top-level variables are declared with `let` for mutable, `const` for immutable.

```javascript
const MAX_LOG_ENTRIES = 200;
let store = null;
let base = null;
```

### Kotlin

2-space indent. PascalCase for class names, camelCase for functions and properties. SCREAMING_SNAKE_CASE for constants.

### Swift

2-space indent. PascalCase for class names.

### Bash

2-space indent [tentative].

## 7. Naming Conventions

### TypeScript

| Category | Convention | Example |
|----------|-----------|---------|
| Variables | camelCase | `monospaceDefaultsApplied` |
| Functions | camelCase | `applyMonospaceDefaults`, `loadOrCreatePairingSecret` |
| Classes | PascalCase | `SyncManagerImpl` |
| Interfaces | PascalCase | `AnimatedModalShellProps`, `WorkoutSession` |
| Type aliases | PascalCase | `WeightUnit`, `SyncRole` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_DAY_CONFIGS`, `SYNC_SECRET_KEY` |
| React components | PascalCase | `AnimatedModalShell`, `WorkoutScreen` |
| Event handlers | camelCase with `handle` prefix | `handleToggleRunning`, `handleReset` |
| Props interfaces | PascalCase with `Props` suffix | `AnimatedModalShellProps`, `BootstrapScreenProps` |
| Modal components | PascalCase with `Modal` suffix | `SettingsModal`, `AddExerciseModal` |
| Error classes | PascalCase with `Error` suffix | `EventEmitterError`, `FileError` |
| State rows / DB records | PascalCase with `Row` suffix | `SyncStateRow` |
| Sync-related constants | `RPC_` prefix in SCREAMING_SNAKE_CASE | `RPC_SYNC_START`, `RPC_SYNC_REMOTE_OP_EVENT` |
| Compact types | PascalCase with `Compact` prefix | `CompactExercise`, `CompactWorkout` |
| Files — components | PascalCase (matching component name) | `AnimatedModalShell.tsx` |
| Files — non-components | camelCase | `workoutRepository.ts`, `logger.ts` |
| Files — barrel exports | `index.ts` | `src/components/index.ts` |
| Directories | camelCase | `useResponsiveLayout`, `holepunchBridge` |
| Private class members | camelCase with no underscore prefix | `private readonly bridge` |

### Kotlin

| Category | Convention | Example |
|----------|-----------|---------|
| Classes | PascalCase | `RestTimerService`, `MainActivity` |
| Functions | camelCase | `onCreate`, `onStartCommand` |
| Properties | camelCase | `stopActionLabel`, `endAtElapsedMs` |
| Constants | SCREAMING_SNAKE_CASE | `PREF_MODE`, `EXTRA_END_AT_ELAPSED_MS` |
| Files | PascalCase | `RestTimerService.kt` |

### JavaScript

Same naming conventions as TypeScript: camelCase for variables and functions, PascalCase for classes, SCREAMING_SNAKE_CASE for module-level constants.

## 8. Type Annotations

> **Repo-wide:** TypeScript `strict: true` enforced by `tsconfig.json`. `tsc --noEmit` must pass before push.

- All function parameters in public signatures are typed.
- Return types are inferred unless the function is exported from a module — then return type is explicit.
- Use `interface` for object shapes (especially component props), `type` for unions and aliases.
- Use `X | null` not `X | undefined` for nullable values. Use `X | null | undefined` only when both are possible.
- `type` imports are preferred: `import type { Foo } from './types'`.
- `satisfies` operator used for constraining without widening: `} satisfies PearLiftRuntimeState`.
- `as const` used for literal type assertions: `export const SYNC_OP_SCHEMA_VERSION = 1 as const`.
- Generic type parameters are PascalCase single letters or meaningful names: `T`, `Raw`.

**Real snippet — interface definitions:**

```typescript
export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  baseWeight: number;
  muscleGroup: string;
  notes: string;
  position: number;
}

export type WeightUnit = 'kg' | 'lb';
```

**Real snippet — type imports and inline types:**

```typescript
import type {
  MutationContext,
  SyncConflictSummary,
  SyncDataSummary,
  SyncRole,
  WorkoutMutation,
  WorkoutStoreSnapshot,
} from './types';
```

## 9. Imports

### TypeScript

- Three import groups: React/RN → third-party → local. Separated by a blank line.
- Within each group, imports are sorted alphabetically by module path.
- `type` imports are extracted to a separate import from the same module or in a dedicated `import type` block.
- Named imports are grouped on one line for the same module path.
- Multi-line imports use trailing commas.
- No `import *` for side-effect-only imports; use `import 'module'` without binding.

**Canonical import block:**

```typescript
import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { MOTION } from '../animation/motion';
import type { PearLiftRuntimeState } from '../backup/types';
import { buildInitialWeights, defaultDayConfigs } from '../data/workouts';
import { resolveFirstSync } from '../sync/firstSync';
```

- Re-exports use barrel `index.ts` files: `export { AnimatedModalShell } from './AnimatedModalShell';`.
- Absolute path imports are never used — all imports are relative (`../`, `./`).

### JavaScript (.mjs)

- Same three-group ordering as TypeScript. Single quotes. Semicolons always. No `type` imports.
- Use `import` not `require`.

### Kotlin

- Standard Kotlin import conventions. Package-level imports use `package expo.modules.pearliftresttimer`.

## 10. Error Handling

### TypeScript

- No custom exception hierarchy. The codebase uses plain `Error` and destructured `catch` blocks.
- Errors are logged via `logError(scope: string, error: unknown)` from `src/utils/errors.ts` and `logSyncError` from `src/sync/logger.ts`.
- `getErrorMessage(error: unknown)` utility extracts a human-readable message from any thrown value.
- Silent error swallowing is acceptable and marked with an inline comment: `// ignore ...`.
- `catch` without binding is used when the error value is irrelevant: `} catch {`.
- No bare `catch` that silently hides a real issue without a comment.

**Real snippet — error extraction utility:**

```typescript
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}
```

**Real snippet — logging and re-throwing:**

```typescript
import { logError } from '../utils/errors';

try {
  await riskyOperation();
} catch (err) {
  logError('sync', err);
  throw err;
}
```

**Real snippet — intentionally swallowing:**

```typescript
try {
  ensureColumn(db, name, definition);
} catch {
  // Existing installs already have the column.
}
```

**Real snippet — ignoring a fire-and-forget promise rejection:**

```typescript
ensureRestTimerChannels(
  i18n.t('restTimer.notification.channelName'),
).catch(() => {
  // ignore channel creation failures
});
```

### JavaScript (.mjs)

- Same pattern: `try/catch` blocks, `// ignore ...` comments for swallowed errors.
- `getErrorMessage` utility defined locally in `backend/sync-backend.mjs`.
- Console logging uses `console.error` for errors, no structured logging library.

## 11. Comments and Docstrings

### TypeScript

- No JSDoc or TSDoc on functions or classes. The codebase avoids docstrings.
- Inline comments are rare and only explain non-obvious behavior or workarounds.
- `// eslint-disable-next-line no-console` precedes every `console.log`/`console.warn`/`console.error` call.
- Swallowed exceptions carry a `// ignore ...` comment explaining why.
- No commented-out code. Dead code is removed.
- Module-level docstrings are not used.

**Real snippet — inline comments:**

```typescript
// ignore channel creation failures

// eslint-disable-next-line no-console
console.error(`[${scope}]`, error);

// Existing installs already have the column.

// Compatibility aliases for existing component code.
```

### JavaScript (.mjs)

- Same conventions as TypeScript. No JSDoc. Inline comments are minimal.
- Top-level file comments exist only for the global declaration: `/* global BareKit */`.

## 12. Testing

### TypeScript

No test files exist in the repository. The project relies on:
- A dev-only verification script at `scripts/verify-first-sync.ts` that imports source modules and runs assertions via `throw new Error`.
- Manual testing on device.

If adding tests:
- Use Bun's built-in test runner or Jest (Jest config is not currently present but `jest` is the detected framework [tentative]).
- Place test files in a `__tests__/` directory adjacent to the source, or in a top-level `tests/` directory.

## 13. Git

> **Repo-wide:**

- **Commit prefixes:** Most commits are unprefixed ("Arrange backup buttons in 2x2 grid layout"). When prefixes are used: `feat:` for new features, `fix:` for bug fixes, `refactor:` for restructures, `migrate:` for dependency migrations. Scoped commits like `feat(sync-ui):` are [tentative].
- **Subject line:** Keep under 80 characters. p95 is 80.
- **Commit body:** Rare. Used for multi-paragraph explanation when needed.
- **Branch naming:** Avoid prefixes that collide with remote tracking refs. Example branch name: `holepunch-rebuild-from-master`.
- **Merge strategy:** Rebase. No merge commits in history.
- **GPG signing:** Not used.
- **Never commit:** `node_modules/`, `.expo/`, `dist/`, `web-build/`, `android/` build outputs, `ios/` build outputs.

## 14. Dependencies and Tooling

### TypeScript / all

| Tool | Config | Command |
|------|--------|---------|
| Package manager | `bunfig.toml` (`linker = "hoisted"`) | `bun install` |
| Lockfile | `bun.lock` (committed) | — |
| Formatter | `biome.json` | `bun run format` |
| Linter | `biome.json` (recommended rules) | `bun run lint` |
| Type checker | `tsconfig.json` (extends `expo/tsconfig.base`, strict) | `bun run typecheck` |
| Git hooks | `.husky/pre-commit`, `.husky/pre-push` | auto |

To add a dependency:
```bash
bun add <package>
bun add -d <package>   # devDependency
```

- `biome.json` config: `quoteStyle: "single"`, `semicolons: "always"`, `indentStyle: "space"`.
- `tsconfig.json`: `strict: true`, `noEmit: true`, `module: "esnext"`, `moduleResolution: "bundler"`, `noFallthroughCasesInSwitch: true`, `noImplicitOverride: true`.
- The `src/sync/` directory is excluded from biome formatting (`!src/sync` in biome.json).
- Biome's VCS integration is enabled — it respects `.gitignore`.

## 15. Red Lines

> **Repo-wide — never violate these.**

- Never use double quotes for string literals in TypeScript or JavaScript files — single quotes only.
- Never omit semicolons in TypeScript or JavaScript files — semicolons are always required.
- Never use `var` in JavaScript — always `let` or `const`.
- Never use absolute import paths — all imports are relative (`../`, `./`).
- Never edit `src/sync/sync.bundle.mjs` directly — it is a build artifact.
- Never import from `scripts/` into `src/` — scripts are dev/build-only.
- Never use `undefined` where `null` is conventionally used — the codebase uses `null` for intentional absence.
- Never add JSDoc/TSDoc docstrings — the codebase does not use them and they would be inconsistent noise.
- Never use `console.log` without the preceding `// eslint-disable-next-line no-console` comment.
- Never leave commented-out code in source files.
- Never silently swallow an error without a `// ignore ...` comment explaining why.
- Never commit build artifacts (`dist/`, `web-build/`, `.expo/`).
- Never skip the pre-commit lint hook — `bun run lint` must pass before every commit.
