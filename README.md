# PearLift

PearLift is a local-first workout tracking app built with Expo and React Native.

## Features

- Workout-day navigation with custom day and week plans
- Exercise cards with weight adjustment, reordering, and editing
- Local backup import/export
- Settings and program configuration screens
- Dark/light theme support

## Tech Stack

- Expo
- React Native
- TypeScript
- AsyncStorage for local persistence

## Getting Started

### Prerequisites

- Node.js
- Bun
- Expo-compatible Android or iOS environment

### Install

```bash
bun install
```

### Run

```bash
bun run start
```

Platform-specific commands:

```bash
bun run android
bun run ios
bun run web
```

## Scripts

- `bun run start` - start the Expo dev client
- `bun run android` - run Android app
- `bun run ios` - run iOS app
- `bun run web` - run web build
- `bun run lint` - run Biome checks
- `bun run typecheck` - run TypeScript checks
- `bun run check:full` - run lint plus typecheck
- `bun run format` - format the codebase

## Project Structure

- `src/components` - reusable UI components
- `src/screens` - screen-level app logic
- `src/backup` - import/export and migration logic
- `src/data` - workout defaults and seed data
- `src/theme` - tokens and theme helpers
- `docs` - release and architecture plans

## Documentation

- [F-Droid + Play Store release plan](docs/PEARLIFT_FDROID_PLAYSTORE_RELEASE_PLAN.md)
- [P2P + relay sync plan](docs/PEARLIFT_P2P_RELAY_SYNC_PLAN.md)

## Notes

- The app is designed to keep user data local first.
- Backup/export flows use the app's own JSON schema and migration logic.
- Android release work is tracked separately in the docs folder.
