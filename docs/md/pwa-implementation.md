# PearLift PWA — Implementation Reference

## Stack

| Layer | Approach |
|-------|----------|
| UI | Expo web (React Native for Web), bundle with Vite |
| State | zustand (reuse `src/store/workoutStore.ts`) |
| Local DB | OPFS + sql.js (replace `expo-sqlite`) |
| KV storage | IndexedDB (replace AsyncStorage, SecureStore) |
| Sync backend | Web Worker (replace Bare worklet + `bare-rpc`) |
| P2P DHT | Hyperswarm v5 + `@hyperswarm/dht-relay` (WebSocket) |
| Autobase/Corestore | Same libs, `random-access-idb` for storage |
| RPC bridge | `MessagePort` / `postMessage` (replace `bare-rpc` IPC) |
| QR scan | `getUserMedia()` + jsQR (replace vision-camera) |
| Notifications | Service Worker Push API |
| Timer audio | `AudioContext` (replace `expo-audio`) |
| PWA shell | `vite-plugin-pwa` for manifest + service worker |
| Haptics | Not available, skip |

## Directory Layout

```
pearlift-pwa/
├── src/
│   ├── ui/                  # Ported React Native components (web-adapted)
│   ├── store/               # zustand store (shared with mobile)
│   ├── sync/                # Holepunch sync logic (shared with mobile)
│   ├── db/                  # sql.js + OPFS wrapper (replaces expo-sqlite)
│   ├── kv/                  # IndexedDB wrapper (replaces AsyncStorage/SecureStore)
│   ├── bridge.ts            # Web Worker RPC bridge (replaces holepunchBridge.ts)
│   ├── qr-scanner.ts        # getUserMedia QR scanner
│   └── audio.ts             # Web Audio timer beeps
├── worker/
│   ├── sync-backend.mjs     # Ported backend (replace bare-fs/bare-path with web stores)
│   └── rpc.ts               # MessagePort-based RPC (replace bare-rpc)
├── public/
│   └── manifest.webmanifest
├── index.html
├── vite.config.ts
└── package.json
```

## Key Changes from Native Code

### 1. Sync Bridge (`worker/`)

Replace `holepunchBridge.ts` + `sync-backend.mjs` with a Web Worker:

```ts
// src/bridge.ts
const worker = new Worker(new URL('../worker/sync-backend.ts', import.meta.url), { type: 'module' });
worker.onmessage = (e) => { /* handle RPC replies & events */ };
```

The worker-side `bare-rpc` becomes a simple `postMessage` wrapper. The `BareKit.IPC` check (`sync-backend.mjs:23`) is replaced with `self.onmessage`.

### 2. Hyperswarm Upgrade

Current: Hyperswarm v4 (`package.json:57`).
Target: Hyperswarm v5 with `@hyperswarm/dht-relay`.

```diff
- import Hyperswarm from 'hyperswarm'
+ import Hyperswarm from 'hyperswarm'
+ import DHT from '@hyperswarm/dht-relay'
+ 
+ const swarm = new Hyperswarm({ dht: new DHT() })
```

The `swarm.join(topic)` API stays the same. Connections route through WebSocket relay instead of raw TCP.

### 3. Storage (`bare-fs` → browser)

```diff
- import { join } from 'bare-path'
- import { mkdir, readFile, writeFile } from 'bare-fs/promises'
- const store = new Corestore(storageRoot)
+ import RAH from 'random-access-idb'
+ const store = new Corestore((name) => new RAH(`pearlift/${name}`))
```

Autobase and Corestore need no API changes — only the storage backend changes.

### 4. SQLite → sql.js + OPFS

```ts
// src/db/index.ts
import initSqlJs from 'sql.js';

const sqlPromise = initSqlJs({ locateFile: (f) => `/wasm/${f}` });
// Persist via OPFS: fileHandle.createWritable()
```

Same SQL schema from `src/storage/database.ts` works.

### 5. Camera → getUserMedia

```ts
// src/qr-scanner.ts
const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
// Pipe to <video>, capture frames to canvas, decode with jsQR
```

### 6. Notifications → Service Worker

```ts
// In service worker (vite-plugin-pwa):
self.registration.showNotification(title, { body, tag: 'rest-timer' });
// No exact-alarm scheduling — only "show immediately" or "show at timestamp" (imprecise)
```

## Shared Code

The following can be shared with mobile verbatim (no changes needed):

- `src/sync/types.ts`
- `src/sync/syncManager.ts`
- `src/sync/canonicalize.ts`
- `src/sync/firstSync.ts`
- `src/sync/rpcCommands.ts`
- `src/sync/rpcEncoding.ts`
- `src/store/workoutStore.ts` (swap storage adapters via DI)
- `src/storage/types.ts`
- `src/storage/workoutRepository.ts` (swap sqlite adapter)
- `src/data/workouts.ts`
- `src/types/`
- `src/utils/`
- `src/i18n/`
- `src/config/`
- `src/theme/`
- `src/backup/`

## Not Transferable

- `pearlift-rest-timer-fgs` (Android foreground service)
- `react-native-notify-kit` (local notifications — use Service Worker)
- `expo-local-authentication` (biometrics)
- `expo-haptics`
- `react-native-bare-kit` (Bare worklet runtime)

## Build & Dev

```bash
# dev
vite

# production bundle
vite build

# PWA preview (test service worker)
vite preview
```

Dependencies: `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa`, `@hyperswarm/dht-relay`, `random-access-idb`, `sql.js`, `jsqr`.

## Effort Estimate

| Area | Effort |
|------|--------|
| Bootstrap repo + Vite + Expo web | 1 day |
| Web Worker sync bridge | 3–5 days |
| Hyperswarm v5 + web storage | 2–3 days |
| sql.js + OPFS adapter | 1–2 days |
| QR scanner (getUserMedia) | 1 day |
| Notifications (service worker) | 1 day |
| Port UI components | 2–3 days |
| PWA manifest + offline | 1 day |
| Testing + edge cases | 3–5 days |
| **Total** | **~3–4 weeks** |
