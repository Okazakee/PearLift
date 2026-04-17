# PearLift P2P + Relay Sync Architecture (Holepunch + Nostr)

## Summary
Your core idea is correct, with one key correction: **Nostr events are signed with your private key, but backup payloads must be encrypted separately** (not “encrypted with private key”).
Chosen defaults for v1:
- Identity model: **Unified master key** (derive both Nostr and Holepunch keys)
- Nostr scope: **Private backup only** (no public/social features yet)

System split:
- **Holepunch:** low-latency direct device-to-device sync when both devices are online
- **Nostr:** durable encrypted backup propagation across relays, recoverable when devices are offline

## Key Corrections and Decisions
- Keep “two systems, two purposes” exactly as you described.
- Replace “encrypt with private key” with:
  - `sign(event)` using Nostr private key
  - `encrypt(payload)` using symmetric key derived from app master key (or NIP-44-compatible encryption envelope)
- Do **not** assume same raw key format works directly in both protocols; use one master secret and deterministic derivation:
  - `master -> nostrKeypair`
  - `master -> holepunchStaticKey`
- Because this is Expo dev-client/no Expo Go, Holepunch integration should be planned as native-capable runtime path (Expo prebuild/dev-client with native module support, or Bare runtime bridge).

## Implementation Changes
- **Identity/Key Management**
  - Add `IdentityService` that creates/imports one master seed and derives:
    - Nostr signing keypair (npub/nsec flow)
    - Holepunch peer key
    - Data encryption key (DEK) for backup payloads
  - Add secure storage adapter (platform keystore-backed).

- **Nostr Backup Layer (v1 private only)**
  - Add `NostrSyncService` with:
    - `publishBackup(snapshot)` -> encrypted payload in event content + metadata tags
    - `fetchLatestBackup(pubkey)` -> latest valid snapshot by version/timestamp
  - Define one app event kind for encrypted backups and one for optional manifests/checkpoints.
  - Conflict rule (v1): latest `updatedAt` wins after signature verification and schema validation.

- **Holepunch Realtime Layer**
  - Add `PeerSyncService` for direct sessions:
    - peer discovery + handshake + encrypted channel
    - fast state transfer (`full snapshot` + optional `delta messages`)
  - Use for “sync now” only; no long-term source of truth in this layer.

- **Sync Orchestration**
  - Add `SyncCoordinator`:
    - `backupNow()` -> Nostr publish
    - `restoreFromCloud()` -> Nostr fetch/restore
    - `syncNearbyDevice()` -> Holepunch session
  - Source of truth in v1: local app state + Nostr backup history.
  - Holepunch successful transfer should still optionally trigger a Nostr backup publish.

## Public Interfaces / Types
- `SyncIdentity`
  - `masterFingerprint`, `nostrPubkey`, `peerId`
- `EncryptedBackupEnvelope`
  - `version`, `createdAt`, `deviceId`, `ciphertext`, `nonce`, `schemaVersion`
- `BackupSnapshot`
  - existing workout/day/week/weights/rest state + `updatedAt`
- Service contracts:
  - `IdentityService.createOrImport()`
  - `NostrSyncService.publishBackup() / fetchLatestBackup()`
  - `PeerSyncService.startSession() / sendSnapshot() / receiveSnapshot()`
  - `SyncCoordinator.backupNow() / restoreFromCloud() / syncNearbyDevice()`

## Test Plan
- **Crypto/Identity**
  - deterministic key derivation from same master seed
  - signature verification and decrypt round-trip
- **Nostr backup**
  - publish encrypted event, fetch from different relay, restore snapshot
  - restore when original sender device is offline
  - reject invalid signature / bad schema / undecryptable payload
- **Holepunch sync**
  - two online devices: connect, transfer snapshot, apply state
  - interrupted transfer recovery + retry
- **Coordinator behavior**
  - “Sync now” uses Holepunch path
  - “Backup/Restore” uses Nostr path
  - post-peer-sync backup publish works
- **Mobile constraints**
  - app restart with persisted identity
  - no Expo Go dependency in flow; works in debug dev-client builds

## Assumptions
- v1 excludes social/public Nostr features.
- v1 keeps local-first state and adds sync services around it.
- Relay set is app-configured (small default list + user-editable later).
- Conflict resolution is simple latest-write-wins for v1; CRDT/offline-merge is deferred.
