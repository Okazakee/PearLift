# Holepunch Integration Audit

## Scope
- Project: PearLift (Expo 55)
- Area: Holepunch/Hyperswarm/HyperDHT sync internals
- Status: In progress (incremental per doc page)

## Module Recommendations (Current Scope)
- Source reviewed: https://docs.pears.com/#guides
- Scope baseline:
  - `/home/okazakee/Desktop/Projects/PearLift/docs/FEATURES_PLAN.md:5`
  - `/home/okazakee/Desktop/Projects/PearLift/docs/FEATURES_PLAN.md:11`

### Needed Now
1. `compact-encoding` (Helper library)
   - Why: current bridge/backend wire format is JSON-based; binary schemas would reduce payload size/parse overhead and improve protocol rigor.
   - Evidence in code:
     - `/home/okazakee/Desktop/Projects/PearLift/src/sync/holepunchBridge.ts:45`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:121`

2. `pear-inspect` (Developer library)
   - Why: improve diagnosis of runtime/worklet sync failures and networking edge cases during ongoing sync hardening.

3. `pear-crasher` (Application library) or equivalent crash-capture strategy
   - Why: aligns with planned "Error boundries + logs" feature and improves production fault visibility.
   - Feature scope reference:
     - `/home/okazakee/Desktop/Projects/PearLift/docs/FEATURES_PLAN.md:5`

### Candidate Later
1. `hyperbee` (Building-block library)
   - Use only if trusted-device authorization requires a richer replicated key-value model than current op stream metadata.
   - Feature scope reference:
     - `/home/okazakee/Desktop/Projects/PearLift/docs/FEATURES_PLAN.md:11`

### Not Needed For Current Scope
1. `pear-electron`, `pear-bridge` (User Interface libraries)
   - Not relevant to Expo mobile runtime.
2. `hyperdrive`, `localdrive`, `mirror-drive`
   - File/directory mirroring is out-of-scope for current planned features.
3. Most Pear app-drive lifecycle modules/tools (`pear-stage`, `pear-seed`, `Drives`, `Hypershell`, `Hypertele`, `Hyperbeam`, `Hyperssh`)
   - Useful operationally, but not required for app runtime behavior in current roadmap.

## Audit Entry 1
- Doc: https://docs.pears.com/howto/connect-two-peers-by-key-with-hyperdht/
- Audited on: 2026-04-23

### Findings
1. High: Current implementation does not match the guide's core API pattern (`DHT.keyPair()` + `dht.createServer()` + `dht.connect(publicKey)`).
   - The code uses `Hyperswarm` topic joins (`swarm.join(topic, { server: true, client: true })`) and no direct `hyperdht` server/client calls.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:506`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:585`
     - `/home/okazakee/Desktop/Projects/PearLift/package.json:53`

2. High: Pairing model is shared secret topic capability, not "connect to known public key".
   - The start contract is based on `pairingSecretHex`, and UI QR payload exposes secret (`s`) plus optional bootstrap key (`b`).
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/src/sync/types.ts:66`
     - `/home/okazakee/Desktop/Projects/PearLift/src/sync/syncManager.ts:126`
     - `/home/okazakee/Desktop/Projects/PearLift/src/components/modals/SyncSetupModal.tsx:116`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:453`

3. Medium: `localPublicKey` in status is not the HyperDHT server key expected by this guide.
   - It reports `base.local.key` (Autobase writer key), which is a different identity surface.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:145`

### Alignment Notes
- Partial alignment: teardown hygiene exists (`goodbye(async () => ensureStopped())`), conceptually similar to guide shutdown cleanup.
  - Ref:
    - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:695`

### Next
- Append one entry per documentation page as the audit continues.

## Audit Entry 2
- Doc: https://docs.pears.com/howto/connect-to-many-peers-by-topic-with-hyperswarm/
- Audited on: 2026-04-23

### Findings
1. No high-severity mismatches for this guide's core pattern.
   - The implementation is aligned with Hyperswarm topic swarming: one swarm instance in runtime, `join(topic, { client: true, server: true })`, connection lifecycle handlers, and teardown.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:506`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:519`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:585`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:695`

2. Low: Topic derivation is fixed by pairing secret rather than runtime-random/default topic display as in the tutorial example.
   - This is likely intentional for device pairing UX, but it changes operational behavior versus tutorial expectations (topic rotation/lifetime must be managed at app level).
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/src/sync/syncManager.ts:63`
     - `/home/okazakee/Desktop/Projects/PearLift/src/sync/syncManager.ts:126`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:253`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:453`

3. Low: Peer accounting is key-based (unique remote key set), not connection-count based.
   - This is okay for identity-level status, but it can under-report concurrent sockets in diagnostics during duplicate/multi-path connection scenarios.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:520`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:522`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:531`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:541`

### Residual Risk / Gaps
- No automated multi-peer churn test coverage found in repo for this path (join/leave/rejoin under many peers), so behavior confidence relies on runtime observation and logs.

## Audit Entry 3
- Doc: https://docs.pears.com/howto/replicate-and-persist-with-hypercore/
- Audited on: 2026-04-23

### Findings
1. Medium: Architecture diverges from the guide's direct `Hypercore` reader/writer model.
   - The implementation uses `Corestore + Autobase` rather than explicit `new Hypercore(...)` cores with reader key passing and direct `core.update()`/read stream pattern.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:463`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:470`
     - `/home/okazakee/Desktop/Projects/PearLift/package.json:28`

2. Medium: Discovery is capability-secret topic based, not `core.discoveryKey` derived from shared read key.
   - The doc pattern joins `core.discoveryKey`; this code derives topic from `pairingSecretHex`, which is a different discovery/capability surface.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:253`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:453`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:585`

3. Low: Guide's single-writer/many-readers framing is not mirrored.
   - This sync path is effectively multi-writer collaboration (`base.append` from local device ops plus `ackWriter` during apply), which is valid for the app but different from tutorial assumptions.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:479`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:650`

### Alignment Notes
- Strong alignment on persistence to disk and replication over swarm connections.
  - Persistent storage root and cursor persistence:
    - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:459`
    - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:176`
    - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:216`
  - Swarm-based replication path:
    - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:519`
    - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:560`

### Residual Risk / Gaps
- No explicit integration check in repo for "writer offline, reader later catches up from persisted log" as a dedicated regression test case.

## Audit Entry 4
- Doc: https://docs.pears.com/howto/work-with-many-hypercores-using-corestore/
- Audited on: 2026-04-23

### Findings
1. No high-severity mismatches for the guide's core Corestore replication pattern.
   - Runtime uses one `Corestore` instance and replicates it on every swarm connection (`store.replicate(socket)`), which matches the recommended "single Corestore + one replication stream per peer" pattern.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:463`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:525`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:560`

2. Medium: Key-exchange/bootstrap mechanism differs from the tutorial's "primary core stores other core keys" pattern.
   - The guide records secondary core keys in a primary core block; this code uses `Autobase` bootstrap key exchange (`bootstrapKeyHex`) and writer acknowledgement (`ackWriter`) instead.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:466`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:470`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:479`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:607`
     - `/home/okazakee/Desktop/Projects/PearLift/src/sync/types.ts:69`

3. Low: Discovery identity surface differs from the guide's "announce only main core discovery key" story.
   - Here, topic discovery is pairing-secret derived (`pairingSecretHex`) rather than directly tied to a primary core's `discoveryKey`.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:453`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:585`

### Alignment Notes
- Functional intent is aligned: the app relies on Corestore-managed internal cores (through Autobase) and co-replicates over a single swarm connection per peer.
  - Refs:
    - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:470`
    - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs:560`

### Residual Risk / Gaps
- No explicit test coverage found for key-rotation/bootstrap migration scenarios across many internal cores (e.g., stale `bootstrapKeyHex` recovery).

## Implementation Wave 1 (Backlog Execution)
- Executed on: 2026-04-23
- Scope decision: keep Hyperswarm topic-based model for this cycle (no HyperDHT key-connect migration).

### Task Status
1. Contract naming/semantics cleanup: completed.
   - Added `localWriterKey` as primary status field, kept `localPublicKey` alias for compatibility.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/src/sync/types.ts`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs`
     - `/home/okazakee/Desktop/Projects/PearLift/src/store/workoutStore.ts`

2. Bridge/backend RPC payload hardening (`compact-encoding`): completed.
   - Replaced JSON transport path with command-aware binary payload codec (legacy JSON decode fallback kept).
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/src/sync/rpcEncoding.ts`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-rpc-encoding.mjs`
     - `/home/okazakee/Desktop/Projects/PearLift/src/sync/holepunchBridge.ts`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs`

3. Backend swarm state machine hardening: completed.
   - Split peer identity and connection tracking (`peerConnectionCounts`, `activeConnections`), tightened connect/close/error transitions, made rejoin guard deterministic (`rejoinInFlight`).
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs`

4. Sync manager lifecycle guards: completed.
   - Added epoch-based stale-listener invalidation, stop-vs-start ordering guard, and explicit subscription cleanup paths.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/src/sync/syncManager.ts`

5. Repository sync invariants tightening: completed.
   - Enforced remote metadata requirements, kept remote idempotency explicit, and made sync-state updates atomic with remote op application.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/src/storage/workoutRepository.ts`

6. React wiring consolidation (business logic only): completed.
   - Moved pairing secret/device id hydration and sync state wiring into store initialization; removed redundant screen-level sync side effects.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/src/store/workoutStore.ts`
     - `/home/okazakee/Desktop/Projects/PearLift/src/screens/WorkoutScreen.tsx`

7. Diagnostics additions: completed (baseline hooks).
   - Added app/runtime diagnostics sink hooks and PearInspect event emission points for sync logs/errors.
   - Refs:
     - `/home/okazakee/Desktop/Projects/PearLift/src/sync/logger.ts`
     - `/home/okazakee/Desktop/Projects/PearLift/backend/sync-backend.mjs`

### Verification Completed
1. `bun run typecheck`: pass.
2. `bun run lint`: pass.
3. Sync backend bundle rebuilt:
   - `node ./scripts/ensure-sync-backend-bundle.mjs --force`.

### Remaining Work (Next Wave)
1. Add explicit automated tests from backlog:
   - bridge/backend codec roundtrip + decode-failure handling
   - sync manager lifecycle races
   - local publish -> remote apply idempotency replay
   - disconnect/reconnect + watchdog transitions
   - store autostart + health propagation (without UI rendering)
