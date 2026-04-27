# PearLift

**A local‑first, privacy‑focused workout tracker with progressive overload, rest timers, and local backup/restore.**

PearLift is a React Native app built with Expo. It helps you log sets, manage progressive overload, and time your rests—all without an account. Your data stays on your device, and you can export/import it as a JSON backup.

<p align="center">
  <img src="./assets/pearlift_icon.png" alt="PearLift Icon" width="120" />
</p>

---

## ✨ Features

- **🏋️ Workout Program Management**  
  Define multi‑week programs with load modifiers and RIR targets. Reorder days and exercises via drag‑and‑drop.

- **📊 Weight Tracking & Progressive Overload**  
  Automatic weight adjustments based on week modifiers. Support for both kg and lb with proper rounding.

- **⏱️ Resilient Rest Timer**  
  Persistent timer that survives app restarts. On Android, a foreground service keeps it running in the background. Haptics and sound on completion.

- **📁 Local Backup & Restore**  
  Export/import all data as a JSON file. Preview changes before applying a backup to avoid accidental overwrites.

- **👥 Share Workout Plans (Planned)**  
  Read‑only sharing with friends is planned for a future release. (Not implemented yet.)

- **🔒 Privacy First**  
  No accounts, no cloud servers. All data lives in a local SQLite database on your device.

---

## 🧱 Tech Stack

| Layer                | Technology                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Framework            | [Expo SDK 55](https://docs.expo.dev/) + [React Native 0.83](https://reactnative.dev/)            |
| State Management     | [Zustand](https://github.com/pmndrs/zustand) + custom optimistic SQLite persistence              |
| Database             | [expo‑sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/)                                  |
| Animations           | [React Native Reanimated 4](https://docs.swmansion.com/react-native-reanimated/)                  |
| Drag & Drop          | [react-native-sortables](https://github.com/margelo/react-native-sortables)                       |
| Background Timer     | Custom native module (Android) + `expo-notifications` fallback                                     |

---

## 📲 Installation & Development

> **Note:** PearLift uses Bun as the package manager and requires Expo CLI.

```bash
# Clone the repository
git clone https://github.com/Okazakee/PearLift.git
cd PearLift

# Install dependencies
bun install

# Start the development client
bun run start

# Run on Android
bun run android

# Run on iOS
bun run ios
```

### Environment Requirements
- Node.js ≥ 20
- Bun ≥ 1.3
- Expo Go or development build on your device

---

## 🗂️ Project Structure (Simplified)

```
├── App.tsx                 # Font loading, notifications, root view
├── plugins/                # Expo config plugins (prebuild hooks)
├── src/
│   ├── backup/             # JSON import/export + diff preview
│   ├── components/         # UI components + modals
│   ├── screens/            # Screen containers (WorkoutScreen, etc.)
│   ├── storage/            # SQLite repository + types
│   ├── store/              # Zustand store + optimistic updates
│   ├── native/             # Native-module bridges (Android foreground service)
│   ├── theme/              # Tokens + light/dark themes
│   └── utils/              # Shared helpers (units, math, errors)
```

---

## 🧠 How It Works

### Local Data Flow

1. UI dispatches **mutations** (e.g. `adjustExerciseWeight`) to the Zustand store.
2. The store applies an **optimistic update** to the in‑memory snapshot for instant feedback.
3. The mutation is persisted via `WorkoutRepository` inside a SQLite transaction.
4. On failure, the store reloads from SQLite to recover a consistent snapshot.

### Rest Timer Persistence

- Timer state is saved to `AsyncStorage` so it can be restored after app kill.
- On Android, a **foreground service** (`pearlift-rest-timer-fgs`) takes over when the app goes to the background, ensuring the timer completes and shows a notification.
- When the app returns, it reconciles the state from the native module.

### Read‑Only Sharing (Planned)

Read‑only sharing of workouts/programs with friends is planned, but not implemented yet. The README will be updated once the feature ships.

---

## 🤝 Contributing

Contributions are welcome! Please open an issue to discuss what you'd like to change or add.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

PearLift is open‑source software licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

## 💬 Acknowledgements

- [Expo](https://expo.dev/) for the amazing toolchain.
- The open‑source community for all the great libraries used in this project.

---

*Built with ❤️ by [Okazakee](https://github.com/Okazakee)*
