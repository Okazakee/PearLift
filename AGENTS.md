## 1. Overview

PearLift is a local-first, privacy-focused workout tracker built with Expo and React Native. The app supports multi-day workout programs, weight tracking with kg/lb support, Android background rest timers, local backup with QR-based device transfer, and peer-to-peer device sync via Holepunch. The primary language is TypeScript with Expo SDK 56. There is no backend server — sync uses a bundled Node.js backend running on-device through react-native-bare-kit.

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
scripts/                     # Build, release, and dev scripts (invoked via bun run)
plugins/                     # Expo config plugins (abi splits, sync backend bundling)
assets/                      # Static assets (images, fonts)
docs/                        # Project documentation (privacy policy, release guide)
tests/                       # Bun test files (mirrors src structure by module)
.maestro/                    # Maestro E2E test flows and subflows
.opencode/                   # OpenCode agent configuration and skills
graphify-out/                # Generated knowledge graph (gitignored, rebuilt via `graphify update .`)
fastlane/                    # Fastlane metadata for app store submissions
android/                     # Android native project files
ios/                         # iOS native project files
```

- New components go in `src/components/`; modal components in `src/components/modals/`.
- New domain types go in `src/types/` or `src/storage/types.ts` for storage-related types.
- Shared utility functions go in `src/utils/`.
- Native module wrappers go in `src/native/`.
- Dev-only scripts go in `scripts/` and are never imported from `src/`.
- Test files go in `tests/` at the repo root, named `<module>.test.ts`.
- The `src/sync/sync.bundle.mjs` file is a build artifact — never edit it directly.
- The worklet (backend JS engine) requires `memoryLimit: 128 * 1024 * 1024` on arm64 devices to prevent V8 pointer compression delays. Configured in `src/sync/holepunchBridge.ts`.
- Sync runs on a bundled Node.js backend via `react-native-bare-kit`. The backend source is in `backend/` and bundled into `src/sync/sync.bundle.mjs` by `bare-pack`.

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

### Test

```bash
bun run test          # run Bun test suite (files in tests/)
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

### Skills

The following skills are available in `.opencode/skills/`:

- **agentskill**: Analyze the codebase and synthesize an AGENTS.md file. Invoke with `/agentskill` or `skill: "agentskill"`.
- **graphify**: Query the knowledge graph for codebase questions, relationships, and architecture. Invoke with `/graphify` or `skill: "graphify"`. The graph is regenerated via `graphify update .`.

### E2E Testing

```bash
bun run e2e:android:build            # Build E2E APK (x86_64 + arm64-v8a)
bun run e2e:android:install          # Install APK on device A
bun run e2e:android:sync             # Full two-device sync test via Maestro
bun run e2e:android:test             # Run single-device Maestro UI tests
```

Maestro test flows live in `.maestro/flows/`. Key flows:
- `sync-create-capture.yaml` — create room, capture pairing secret + bootstrap key
- `sync-join.yaml` — join room with invite
- `sync-copy-debug-payloads.yaml` — capture full sync diagnostics (status, connections, room state, paired devices)
- `sync-data-creator-mutate.yaml` — add/edit/weight mutations on creator
- `sync-data-joiner-assert.yaml` — assert synced data on joiner

Diagnostics are written to `~/.maestro/tests/<latest>/maestro.log` as `JsConsole` output. The e2e runner parses `SYNC_DIAGNOSTICS` JSON from this log.

## 6. Code Formatting

> **Repo-wide:** Biome is configured as the formatter and linter. Config lives at `biome.json`. Always generate code that matches these conventions — do not rely on biome to fix formatting after the fact.

### TypeScript / TSX

| Item | Convention |
|------|-----------|
| Indentation | 2 spaces |
| Line length | p95 is 68 chars; hard wrap at ~80 |
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
import { MOTION } from '@/animation/motion';
import {
  AnimatedFadeInView,
  AnimatedSlideInRightView,
  AnimatedSlideInView,
} from '@/animation/primitives';
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
| Files — test files | CamelCase with `.test.ts` suffix | `backupDiff.test.ts`, `firstSync.test.ts` |
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
- `type` imports are preferred: `import type { Foo } from '@/types'`.
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
} from '@/sync/types';
```

## 9. Imports

### TypeScript

- All imports use the `@/` path alias (maps to `src/` via tsconfig `paths`). Relative paths (`../`, `./`) are never used.
- Three import groups: React/RN → third-party → local (`@/`). Separated by a blank line.
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
import { MOTION } from '@/animation/motion';
import type { PearLiftRuntimeState } from '@/backup/types';
import { buildInitialWeights, defaultDayConfigs } from '@/data/workouts';
import { resolveFirstSync } from '@/sync/firstSync';
```

- Re-exports use barrel `index.ts` files: `export { AnimatedModalShell } from './AnimatedModalShell';` (relative paths within barrel files are ok since they reference siblings).
- `@/` path alias is configured in `tsconfig.json` as `"@/*": ["./src/*"]`.

### JavaScript (.mjs)

- Same three-group ordering as TypeScript. Single quotes. Semicolons always. No `type` imports.
- Use `import` not `require`.
- JavaScript files in `backend/` and `scripts/` use relative paths since they are outside `src/`.

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
import { logError } from '@/utils/errors';

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

- **Framework:** Bun's built-in test runner (`bun:test`). Run with `bun run test`.
- **File location:** All test files live in `tests/` at the repo root.
- **File naming:** `<module>.test.ts` (e.g., `backupDiff.test.ts`, `firstSync.test.ts`).
- **Test structure:** `describe` blocks for grouping, `test` for individual cases, `expect` for assertions.
- **Imports:** Tests use `@/` path aliases to import source modules, same as application code.
- Helper functions defined at module scope within each test file (not in a shared utilities directory).

**Real snippet — canonical test:**

```typescript
import { describe, expect, test } from 'bun:test';
import { parseAndMigrateBackup, parseBackupJson } from '@/backup/migration';

describe('backup migration', () => {
  test('rejects invalid backup payloads early', () => {
    let caught: unknown = null;
    try {
      parseBackupJson('{');
    } catch (error) {
      caught = error;
    }

    expect(caught instanceof Error ? caught.message : String(caught)).toBe(
      'Invalid JSON file.',
    );
  });
});
```

**Real snippet — test with builder helpers:**

```typescript
import { describe, expect, test } from 'bun:test';
import type { PearLiftRuntimeState } from '@/backup/types';
import {
  buildInitialWeights,
  defaultDayConfigs,
  defaultWeekConfigs,
  defaultWorkouts,
} from '@/data/workouts';
import { resolveFirstSync } from '@/sync/firstSync';
import type { WorkoutSession } from '@/types';

function runtime(workouts: WorkoutSession[]): PearLiftRuntimeState {
  return {
    workouts,
    userWeights: buildInitialWeights(workouts),
    weekConfigs: defaultWeekConfigs,
    dayConfigs: defaultDayConfigs,
    currentWeek: 1,
    currentDay: defaultDayConfigs[0]?.id ?? 'day1',
    restDuration: 150,
    themeMode: 'system',
    weightUnit: 'kg',
    language: 'system',
  };
}

describe('resolveFirstSync', () => {
  test('returns already_in_sync for identical runtimes', () => {
    const defaultRuntime = runtime(defaultWorkouts);
    expect(resolveFirstSync(defaultRuntime, defaultRuntime, 1).kind).toBe(
      'already_in_sync',
    );
  });
});
```

- A dev-only verification script also exists at `scripts/verify-first-sync.ts`.
- No test fixtures directory — test data is constructed inline within each test file.
- No `beforeEach`/`afterEach` hooks are used.
- Tests are explicitly typed — helper functions have explicit parameter and return types.

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
| Test runner | Bun built-in (`bun:test`) | `bun run test` |
| Git hooks | `.husky/pre-commit`, `.husky/pre-push` | auto |

To add a dependency:
```bash
bun add <package>
bun add -d <package>   # devDependency
```

- `biome.json` config: `quoteStyle: "single"`, `semicolons: "always"`, `indentStyle: "space"`.
- `tsconfig.json`: `strict: true`, `noEmit: true`, `module: "esnext"`, `moduleResolution: "bundler"`, `noFallthroughCasesInSwitch: true`, `noImplicitOverride: true`, `paths: { "@/*": ["./src/*"] }`.
- The `src/sync/` directory is excluded from biome formatting (`!src/sync` in biome.json).
- Biome's VCS integration is enabled — it respects `.gitignore`.

## 15. Red Lines

> **Repo-wide — never violate these.**

- Never use double quotes for string literals in TypeScript or JavaScript files — single quotes only.
- Never omit semicolons in TypeScript or JavaScript files — semicolons are always required.
- Never use `var` in JavaScript — always `let` or `const`.
- Never use relative import paths (`../`, `./`) in `src/` or `tests/` — use the `@/` path alias instead. Barrel re-exports within `index.ts` files are the only exception.
- Never use absolute file-system import paths — `@/` is the only allowed non-relative prefix.
- Never edit `src/sync/sync.bundle.mjs` directly — it is a build artifact.
- Never import from `scripts/` into `src/` or `tests/` — scripts are dev/build-only.
- Never use `undefined` where `null` is conventionally used — the codebase uses `null` for intentional absence.
- Never add JSDoc/TSDoc docstrings — the codebase does not use them and they would be inconsistent noise.
- Never use `console.log` without the preceding `// eslint-disable-next-line no-console` comment.
- Never leave commented-out code in source files.
- Never silently swallow an error without a `// ignore ...` comment explaining why.
- Never commit build artifacts (`dist/`, `web-build/`, `.expo/`).
- Never skip the pre-commit lint hook — `bun run lint` must pass before every commit.
- Never place test files outside `tests/` at the repo root — tests do not use `__tests__/` directories.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
