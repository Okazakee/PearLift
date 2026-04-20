# PearLift

<p align="center">
  <img src="./assets/pearlift_icon.png" alt="PearLift Icon" width="128" />
</p>

<p align="center">
  A beautiful rest timer app for your workouts
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-iOS-000000?style=flat&logo=apple" alt="Platform iOS" />
  <img src="https://img.shields.io/badge/platform-Android-000000?style=flat&logo=android" alt="Platform Android" />
  <img src="https://img.shields.io/badge/expo-v55-000000?style=flat" alt="Expo" />
  <img src="https://img.shields.io/badge/react-native-0.83-000000?style=flat" alt="React Native" />
</p>

---

## Features

- **Customizable Rest Timers** — Set rest durations that fit your workout routine
- **Background Timer** — Keep timers running even when the app is minimized
- **Haptic Feedback** — Feel the transition between rest and workout periods
- **Audio Cues** — Sound notifications for timer start/end
- **Workout Library** — Save and manage your favorite workouts
- **Secure Storage** — Your data stays protected with local authentication
- **Dark Mode** — Beautiful dark UI optimized for gym environments

---

## Tech Stack

| Category | Technology |
|----------|-------------|
| Framework | Expo SDK 55 |
| Language | TypeScript |
| Runtime | React Native 0.83 |
| State Management | Zustand |
| Animations | React Native Reanimated |
| Database | expo-sqlite |
| UI Icons | Lucide React Native |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Bun (recommended) or npm/yarn
- Xcode (iOS development)
- Android Studio (Android development)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd PearLift

# Install dependencies
bun install

# Start the development server
bun start
```

### Running on Device

**iOS:**
```bash
bun run ios
```

**Android:**
```bash
bun run android
```

---

## Project Structure

```
PearLift/
├── assets/              # App icons and splash screens
├── src/
│   ├── animation/       # Animation utilities
│   ├── backup/         # Data backup functionality
│   ├── components/     # Reusable UI components
│   ├── config/        # App configuration
│   ├── data/          # Static data and defaults
│   ├── native/        # Native module bridges
│   ├── screens/       # App screens
│   ├── storage/       # Database and persistence
│   ├── theme/         # Design tokens
│   ├── types/         # TypeScript types
│   └── utils/        # Utility functions
├── android/            # Android native project
├── ios/                # iOS native project
├── app.json            # Expo configuration
├── package.json        # Dependencies
└── tsconfig.json       # TypeScript config
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `bun start` | Start Expo dev server |
| `bun run ios` | Run on iOS simulator |
| `bun run android` | Run on Android emulator |
| `bun run lint` | Run Biome linter |
| `bun run typecheck` | Run TypeScript check |
| `bun run check:full` | Run lint + typecheck |

---

## License

MIT