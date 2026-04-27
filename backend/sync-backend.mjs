/* global BareKit */

import Autobase from 'autobase';
import b4a from 'b4a';
import { mkdir, readFile, writeFile } from 'bare-fs/promises';
import { join } from 'bare-path';
import RPC from 'bare-rpc';
import Corestore from 'corestore';
import goodbye from 'graceful-goodbye';
import Hyperswarm from 'hyperswarm';
import {
  RPC_SYNC_GET_LOGS,
  RPC_SYNC_LOG_EVENT,
  RPC_SYNC_PUBLISH,
  RPC_SYNC_REMOTE_OP_EVENT,
  RPC_SYNC_START,
  RPC_SYNC_STATUS,
  RPC_SYNC_STATUS_EVENT,
  RPC_SYNC_STOP,
} from './sync-rpc-commands.mjs';
import { decodeRpcPayload, encodeRpcPayload } from './sync-rpc-encoding.mjs';

const { IPC } = BareKit;

let store = null;
let base = null;
let swarm = null;
let discovery = null;
let currentTopic = null;
const peerConnectionCounts = new Map();
let activeConnections = 0;
let rpc = null;
let sentViewLength = 0;
let sentRemoteOpIds = new Set();
let isFlushing = false;
let runtimeStatus = 'idle';
let lastBackendError = null;
let lastSyncedAt = null;
let localDeviceId = null;
let topicHex = null;
let storageRoot = null;
let cursorPersistTimer = null;
let cursorDirty = false;
let lastDhtBootstrapped = false;
let reconnectAttempts = 0;
let stuckSince = null;
let heartbeatTimer = null;
let startedAt = null;
let rpcHandshakeLogged = false;
let rejoinInFlight = false;
let discoveryOnlyMode = false;
let disableCursorOptimization = false;

const MAX_LOG_ENTRIES = 200;
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL_MS = 5000;
const WATCHDOG_STUCK_THRESHOLD_MS = 45000;
const logRing = [];
const WORKLET_BOOT_AT = new Date().toISOString();
const SOCKET_NO_DATA_TIMEOUT_MS = 10000;
const SOCKET_PONG_TIMEOUT_MS = 8000;
const REPLICATION_START_TIMEOUT_MS = 6000;
const PING_INTERVAL_MS = 7000;
const PING_FRAME = 'PL_SYNC_PING';
const PONG_FRAME = 'PL_SYNC_PONG';
const socketStates = new Set();
let socketSeq = 0;

function hashSecretHex(secretHex) {
  let hash = 2166136261;
  for (let i = 0; i < secretHex.length; i += 1) {
    hash ^= secretHex.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function getErrorMessage(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string') {
    return error.message;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

function appendLogRing(level, scope, eventName, message, details) {
  logRing.push({
    ts: Date.now(),
    level: level || 'info',
    scope: scope || 'unknown',
    key: eventName || 'event',
    message: message ?? '',
    data: details ?? undefined,
  });
  if (logRing.length > MAX_LOG_ENTRIES) {
    logRing.splice(0, logRing.length - MAX_LOG_ENTRIES);
  }
}

function emitLog(level, scope, eventName, payload, details = null) {
  const message =
    typeof payload === 'string' ? payload : getErrorMessage(payload);
  appendLogRing(level, scope, eventName, message, details);
  if (!rpc) return;
  try {
    const rpcEvent = rpc.event(RPC_SYNC_LOG_EVENT);
    const payload = {
      level: level || 'error',
      scope: scope || 'unknown',
      event: eventName || 'event',
      message,
      details,
    };
    rpcEvent.send(encodeRpcPayload(RPC_SYNC_LOG_EVENT, 'event', payload));
    try {
      globalThis?.PearInspect?.emit?.('pearlift-sync-log', payload);
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

function logBackendError(scope, error) {
  lastBackendError = getErrorMessage(error);
  runtimeStatus = 'error';
  emitLog('error', scope, 'error', error);
  try {
    // eslint-disable-next-line no-console
    console.error(`[pearlift-sync/${scope}]`, error?.stack ?? error);
  } catch {
    // ignore
  }
}

function logMajorEvent(scope, eventName, message, details = null) {
  emitLog('info', scope, eventName, message, details);
}

function logMajorWarning(scope, eventName, message, details = null) {
  emitLog('warn', scope, eventName, message, details);
}

function decodeRequest(req) {
  return decodeRpcPayload(req.command, 'request', req.data);
}

function safeReply(req, payload) {
  if (req?.sent) return;
  req.reply(encodeRpcPayload(req.command, 'response', payload ?? {}));
}

function getPeerKeys() {
  return Array.from(peerConnectionCounts.entries())
    .filter(([, count]) => count > 0)
    .map(([key]) => key);
}

function getPeerCount() {
  return getPeerKeys().length;
}

function trackConnectionOpen(remoteKey) {
  activeConnections += 1;
  if (!remoteKey) return;
  const prev = peerConnectionCounts.get(remoteKey) ?? 0;
  peerConnectionCounts.set(remoteKey, prev + 1);
}

function trackConnectionClose(remoteKey) {
  activeConnections = Math.max(0, activeConnections - 1);
  if (!remoteKey) return;
  const prev = peerConnectionCounts.get(remoteKey) ?? 0;
  const next = prev - 1;
  if (next <= 0) {
    peerConnectionCounts.delete(remoteKey);
    return;
  }
  peerConnectionCounts.set(remoteKey, next);
}

function createSocketState(socket, remoteKey) {
  socketSeq += 1;
  return {
    socketId: socketSeq,
    socket,
    remoteKey: remoteKey ?? null,
    openedAt: Date.now(),
    firstByteAt: null,
    lastDataAt: null,
    lastPingAt: null,
    lastPongAt: null,
    pingOutstanding: false,
    pingTimer: null,
    handshakeOk: false,
    replicationStarted: false,
    closed: false,
    timeoutReportedNoData: false,
    timeoutReportedNoPong: false,
    timeoutReportedReplication: false,
  };
}

function clearSocketPingTimer(state) {
  if (!state?.pingTimer) return;
  clearInterval(state.pingTimer);
  state.pingTimer = null;
}

function emitSocketStatus(status, state) {
  emitStatus(status, null);
  logMajorEvent('status', status, `Status -> ${status}`, {
    socketId: state?.socketId ?? null,
    remoteKey: state?.remoteKey ?? null,
    peers: getPeerCount(),
    connections: activeConnections,
  });
}

function logSocketTimeout(state, reason, extra = null) {
  logMajorWarning('socket', 'timeout_reason', 'Socket timeout reason.', {
    reason,
    socketId: state.socketId,
    remoteKey: state.remoteKey,
    ...extra,
  });
}

function sendSocketFrame(socket, state, frame, eventName) {
  try {
    socket.write(`${frame}\n`);
    if (frame === PING_FRAME) {
      state.lastPingAt = Date.now();
      state.pingOutstanding = true;
    }
    logMajorEvent('socket', eventName, `Socket frame sent: ${eventName}.`, {
      socketId: state.socketId,
      remoteKey: state.remoteKey,
    });
  } catch (error) {
    logMajorWarning('socket', 'write_failed', getErrorMessage(error), {
      socketId: state.socketId,
      remoteKey: state.remoteKey,
    });
  }
}

function isDhtBootstrapped() {
  try {
    return !!swarm?.dht?.bootstrapped;
  } catch {
    return false;
  }
}

function buildStatus(status = runtimeStatus, lastError = lastBackendError) {
  const peerKeys = getPeerKeys();
  return {
    status,
    peers: peerKeys.length,
    connections: activeConnections,
    peerKeys,
    localWriterKey: base?.local?.key
      ? b4a.toString(base.local.key, 'hex')
      : null,
    localPublicKey: base?.local?.key
      ? b4a.toString(base.local.key, 'hex')
      : null,
    autobaseKey: base?.key ? b4a.toString(base.key, 'hex') : null,
    topicHex,
    bootstrapped: isDhtBootstrapped(),
    reconnectAttempts,
    lastSyncedAt,
    lastError,
  };
}

function emitStatus(status = 'synced', lastError = null) {
  if (!rpc) return;
  runtimeStatus = status;
  lastBackendError = lastError;
  const rpcEvent = rpc.event(RPC_SYNC_STATUS_EVENT);
  rpcEvent.send(
    encodeRpcPayload(
      RPC_SYNC_STATUS_EVENT,
      'event',
      buildStatus(status, lastError),
    ),
  );
}

function isTransientSocketError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('connection timed out') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('connection reset') ||
    message.includes('eof')
  );
}

function cursorPath() {
  if (!storageRoot) return null;
  return join(storageRoot, 'sync-cursor.json');
}

async function loadCursor() {
  if (disableCursorOptimization) return 0;
  const path = cursorPath();
  if (!path || !base?.key) return 0;
  try {
    const raw = await readFile(path);
    const parsed = JSON.parse(b4a.toString(raw));
    const key = b4a.toString(base.key, 'hex');
    if (parsed && parsed.key === key && typeof parsed.sent === 'number') {
      return parsed.sent;
    }
  } catch {
    // no cursor yet
  }
  return 0;
}

function scheduleCursorPersist() {
  cursorDirty = true;
  if (cursorPersistTimer) return;
  cursorPersistTimer = setTimeout(() => {
    cursorPersistTimer = null;
    if (!cursorDirty) return;
    cursorDirty = false;
    void persistCursor();
  }, 500);
}

async function persistCursor() {
  if (disableCursorOptimization) return;
  const path = cursorPath();
  if (!path || !base?.key) return;
  try {
    const payload = JSON.stringify({
      key: b4a.toString(base.key, 'hex'),
      sent: sentViewLength,
    });
    await writeFile(path, payload);
  } catch (error) {
    logMajorWarning('cursor', 'persist_failed', getErrorMessage(error));
  }
}

async function flushRemoteOps() {
  if (discoveryOnlyMode) return;
  if (!rpc || !base?.view) return;
  if (isFlushing) return;

  isFlushing = true;
  try {
    const total = base.view.length;
    let flushed = 0;
    for (let i = 0; i < total; i += 1) {
      const op = await base.view.get(i);
      // Don't ship our own ops back to the UI.
      if (op?.deviceId && localDeviceId && op.deviceId === localDeviceId) {
        continue;
      }
      const opKey =
        typeof op?.opId === 'string' ? op.opId : `${i}:${JSON.stringify(op)}`;
      if (sentRemoteOpIds.has(opKey)) {
        continue;
      }
      sentRemoteOpIds.add(opKey);
      const rpcEvent = rpc.event(RPC_SYNC_REMOTE_OP_EVENT);
      rpcEvent.send(encodeRpcPayload(RPC_SYNC_REMOTE_OP_EVENT, 'event', op));
      flushed += 1;
    }
    sentViewLength = Math.max(sentViewLength, total);
    if (flushed > 0) {
      lastSyncedAt = new Date().toISOString();
      emitStatus('synced', null);
      logMajorEvent('backend', 'remote_flush', 'Remote ops flushed.', {
        count: flushed,
      });
    }
    scheduleCursorPersist();
  } finally {
    isFlushing = false;
  }
}

function topicFromSecretHex(secretHex) {
  if (typeof secretHex !== 'string' || secretHex.length !== 64) {
    throw new Error('Pairing secret must be 32 bytes encoded as 64-char hex.');
  }
  const topic = b4a.from(secretHex, 'hex');
  if (topic.byteLength !== 32) {
    throw new Error('Pairing secret produced invalid topic length.');
  }
  return topic;
}

function normalizeStoragePath(pathOrUri) {
  if (typeof pathOrUri !== 'string') return null;
  if (pathOrUri.startsWith('file://')) {
    return decodeURIComponent(pathOrUri.replace(/^file:\/\//, ''));
  }
  return pathOrUri;
}

async function publishBackendPresence() {
  if (!base || !localDeviceId) return;
  try {
    const op = {
      schemaVersion: 1,
      opId: `${localDeviceId}:presence:${Date.now()}`,
      deviceId: localDeviceId,
      lamport: 0,
      createdAt: new Date().toISOString(),
      payload: { kind: 'presence' },
    };
    await base.append(op, { optimistic: true });
  } catch (error) {
    logMajorWarning('presence', 'publish_failed', getErrorMessage(error));
  }
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function updateStuckState() {
  if (runtimeStatus === 'connecting' && activeConnections === 0) {
    if (stuckSince === null) stuckSince = Date.now();
  } else {
    stuckSince = null;
  }
}

async function rejoinTopic() {
  if (!swarm || !currentTopic) return;
  if (rejoinInFlight) {
    logMajorEvent(
      'watchdog',
      'rejoin_skipped',
      'Topic rejoin already in progress.',
      {
        reconnectAttempts,
        peers: getPeerCount(),
        connections: activeConnections,
      },
    );
    return;
  }
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logBackendError(
      'watchdog',
      new Error(
        `Reconnect cap reached after ${MAX_RECONNECT_ATTEMPTS} attempts.`,
      ),
    );
    emitStatus('error', lastBackendError);
    return;
  }
  reconnectAttempts += 1;
  rejoinInFlight = true;
  logMajorEvent('watchdog', 'rejoin', 'Forcing topic rejoin.', {
    attempt: reconnectAttempts,
    peers: getPeerCount(),
    connections: activeConnections,
  });
  try {
    if (discovery) {
      try {
        await discovery.destroy();
      } catch {
        // ignore
      }
      discovery = null;
    }
    discovery = swarm.join(currentTopic, { server: true, client: true });
    await discovery.flushed();
    emitStatus('dht_ready', null);
    logMajorEvent(
      'swarm',
      'topic_reannounced',
      'Swarm topic re-announced after watchdog rejoin.',
    );
    emitStatus('connecting', null);
    stuckSince = Date.now();
  } catch (error) {
    logMajorWarning('swarm', 'flush_failed', getErrorMessage(error));
    logBackendError('watchdog', error);
  } finally {
    rejoinInFlight = false;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (runtimeStatus === 'idle') {
      stopHeartbeat();
      return;
    }
    const dhtReady = isDhtBootstrapped();
    if (dhtReady !== lastDhtBootstrapped) {
      lastDhtBootstrapped = dhtReady;
      logMajorEvent(
        'dht',
        'ready_transition',
        dhtReady ? 'DHT became bootstrapped.' : 'DHT lost bootstrap.',
        { dhtReady },
      );
      emitStatus(runtimeStatus, lastBackendError);
    }
    const elapsed = startedAt ? Date.now() - startedAt : 0;
    logMajorEvent('heartbeat', 'tick', 'Sync heartbeat.', {
      peers: getPeerCount(),
      connections: activeConnections,
      dhtReady,
      elapsedMs: elapsed,
      status: runtimeStatus,
      reconnectAttempts,
    });

    const now = Date.now();
    for (const state of socketStates) {
      if (state.closed) continue;

      if (
        !state.firstByteAt &&
        now - state.openedAt > SOCKET_NO_DATA_TIMEOUT_MS
      ) {
        if (!state.timeoutReportedNoData) {
          state.timeoutReportedNoData = true;
          logSocketTimeout(state, 'connected_but_no_data', {
            sinceOpenMs: now - state.openedAt,
          });
        }
        if (discoveryOnlyMode && !state.pingOutstanding) {
          sendSocketFrame(
            state.socket,
            state,
            PING_FRAME,
            'ping_sent_connected_but_no_data',
          );
        }
      }

      if (
        state.pingOutstanding &&
        state.lastPingAt &&
        now - state.lastPingAt > SOCKET_PONG_TIMEOUT_MS
      ) {
        if (!state.timeoutReportedNoPong) {
          state.timeoutReportedNoPong = true;
          logSocketTimeout(state, 'ping_sent_no_pong', {
            sincePingMs: now - state.lastPingAt,
          });
        }
      }

      if (
        !discoveryOnlyMode &&
        !state.replicationStarted &&
        now - state.openedAt > REPLICATION_START_TIMEOUT_MS
      ) {
        if (!state.timeoutReportedReplication) {
          state.timeoutReportedReplication = true;
          logSocketTimeout(state, 'replication_not_started', {
            sinceOpenMs: now - state.openedAt,
          });
        }
      }
    }

    updateStuckState();
    if (
      stuckSince !== null &&
      Date.now() - stuckSince > WATCHDOG_STUCK_THRESHOLD_MS
    ) {
      void rejoinTopic();
    }
    // Emit status so UI sees fresh peer count / DHT / stuck state.
    emitStatus(runtimeStatus, lastBackendError);
  }, HEARTBEAT_INTERVAL_MS);
}

async function ensureStopped() {
  if (cursorPersistTimer) {
    clearTimeout(cursorPersistTimer);
    cursorPersistTimer = null;
  }
  if (cursorDirty) {
    try {
      await persistCursor();
    } catch {
      // ignore
    }
    cursorDirty = false;
  }

  if (discovery) {
    try {
      await discovery.destroy();
    } catch {
      // ignore
    }
    discovery = null;
  }

  if (swarm) {
    try {
      swarm.removeAllListeners?.();
      await swarm.destroy();
    } catch {
      // ignore
    }
    swarm = null;
  }

  if (base) {
    try {
      base.removeAllListeners?.();
      await base.close();
    } catch {
      // ignore
    }
    base = null;
  }

  if (store) {
    try {
      await store.close();
    } catch {
      // ignore
    }
    store = null;
  }

  peerConnectionCounts.clear();
  for (const state of socketStates) {
    clearSocketPingTimer(state);
  }
  socketStates.clear();
  activeConnections = 0;
  sentViewLength = 0;
  sentRemoteOpIds = new Set();
  isFlushing = false;
  runtimeStatus = 'idle';
  lastBackendError = null;
  lastSyncedAt = null;
  localDeviceId = null;
  topicHex = null;
  storageRoot = null;
  discovery = null;
  currentTopic = null;
  lastDhtBootstrapped = false;
  reconnectAttempts = 0;
  stuckSince = null;
  startedAt = null;
  rpcHandshakeLogged = false;
  rejoinInFlight = false;
  discoveryOnlyMode = false;
  disableCursorOptimization = false;
  stopHeartbeat();
}

async function startSync(config) {
  await ensureStopped();
  runtimeStatus = 'idle';
  lastBackendError = null;
  lastSyncedAt = null;

  discoveryOnlyMode = !!config?.debug?.discoveryOnly;
  disableCursorOptimization = !!config?.debug?.disableCursorOptimization;

  const topic = topicFromSecretHex(config.pairingSecretHex);
  topicHex = b4a.toString(topic, 'hex');
  const basePath = normalizeStoragePath(config.storagePath);
  if (!basePath) {
    throw new Error('Missing storagePath');
  }
  storageRoot = join(basePath, 'pearlift-sync');
  await mkdir(storageRoot, { recursive: true });
  localDeviceId = config.deviceId ?? null;
  logMajorEvent('startup', 'snapshot', 'Worklet startup snapshot.', {
    appLaunchAt: WORKLET_BOOT_AT,
    workletStartAt: WORKLET_BOOT_AT,
    storagePathFromRn: config.storagePath ?? null,
    storageRoot,
    deviceId: localDeviceId,
    pairingSecretHash: hashSecretHex(config.pairingSecretHex),
    topicHex,
    bootstrapKeyHexState: config.bootstrapKeyHex ? 'present' : 'absent',
    bootstrapKeyHex: config.bootstrapKeyHex ?? null,
    discoveryOnlyMode,
    disableCursorOptimization,
  });

  if (!discoveryOnlyMode) {
    store = new Corestore(storageRoot);
    await store.ready();

    const bootstrap = config.bootstrapKeyHex
      ? b4a.from(config.bootstrapKeyHex, 'hex')
      : null;

    base = new Autobase(store, bootstrap, {
      valueEncoding: 'json',
      optimistic: true,
      open(viewStore) {
        return viewStore.get({ name: 'sync-ops', valueEncoding: 'json' });
      },
      async apply(nodes, view, host) {
        for (const node of nodes) {
          if (node.value == null) continue;
          await host.ackWriter(node.from.key);
          await view.append(node.value);
        }
      },
    });

    await base.ready();

    const storedCursor = await loadCursor();
    sentViewLength = disableCursorOptimization
      ? 0
      : Math.min(storedCursor, base.view.length);
    logMajorEvent(
      'cursor',
      disableCursorOptimization ? 'disabled' : 'restored',
      disableCursorOptimization
        ? 'Cursor optimization disabled for debug startup.'
        : 'Cursor restored from disk.',
      {
        stored: storedCursor,
        applied: sentViewLength,
        viewLength: base.view.length,
      },
    );
    logMajorEvent('autobase', 'ready', 'Autobase ready.', {
      viewLength: base.view.length,
      writable: !!base.writable,
      autobaseKey: b4a.toString(base.key, 'hex'),
      localWriterKey: base.local?.key
        ? b4a.toString(base.local.key, 'hex')
        : null,
    });
    logMajorEvent('autobase', 'start_config', 'Start configuration.', {
      hasBootstrapKey: !!config.bootstrapKeyHex,
      bootstrapKeyHexState: config.bootstrapKeyHex ? 'present' : 'absent',
      deviceId: config.deviceId,
      storageRoot,
    });

    base.on('update', () => {
      void flushRemoteOps().catch((error) => {
        logBackendError('flushRemoteOps', error);
        emitStatus('error', getErrorMessage(error));
      });
    });

    base.on('writers', () => {
      logMajorEvent('autobase', 'writers_changed', 'Writer set updated.', {
        writerCount: base.writers?.length ?? 0,
      });
      // Flush any pending remote ops that may now be ready.
      void flushRemoteOps().catch((error) => {
        logBackendError('flushRemoteOps', error);
      });
    });
  } else {
    sentViewLength = 0;
    logMajorEvent(
      'backend',
      'discovery_only_enabled',
      'Discovery-only debug mode enabled; replication/apply layers skipped.',
    );
  }

  swarm = new Hyperswarm();
  const swarmPublicKey = swarm?.keyPair?.publicKey
    ? b4a.toString(swarm.keyPair.publicKey, 'hex')
    : null;
  logMajorEvent('swarm', 'keypair', 'Swarm keypair initialized.', {
    swarmPublicKey,
  });

  swarm.on('error', (error) => {
    logBackendError('swarm', error);
    emitStatus('error', getErrorMessage(error));
  });

  swarm.on('update', () => {
    logMajorEvent('swarm', 'update', 'Swarm peer discovery updated.', {
      peers: getPeerCount(),
      connections: activeConnections,
    });
  });

  swarm.on('connection', (socket, peerInfo) => {
    const remoteKeyBuf = peerInfo?.publicKey ?? socket.remotePublicKey;
    const remoteKey = remoteKeyBuf ? b4a.toString(remoteKeyBuf, 'hex') : null;
    const socketState = createSocketState(socket, remoteKey);
    socketStates.add(socketState);
    let discoveryBuffer = '';
    let closed = false;
    trackConnectionOpen(remoteKey);
    reconnectAttempts = 0;
    rejoinInFlight = false;

    stuckSince = null;
    if (runtimeStatus !== 'error') {
      emitSocketStatus('peer_connected', socketState);
    } else {
      emitStatus('error', lastBackendError);
    }
    logMajorEvent('socket', 'connection_opened', 'Socket connection opened.', {
      socketId: socketState.socketId,
      peers: getPeerCount(),
      connections: activeConnections,
      remoteKey,
    });

    socket.once('close', () => {
      if (closed) return;
      closed = true;
      socketState.closed = true;
      clearSocketPingTimer(socketState);
      socketStates.delete(socketState);
      trackConnectionClose(remoteKey);
      logSocketTimeout(socketState, 'socket_closed');
      if (runtimeStatus !== 'error') {
        const statusAfterClose =
          activeConnections > 0 ? 'peer_connected' : 'connecting';
        emitStatus(statusAfterClose, lastBackendError);
      } else {
        emitStatus('error', lastBackendError);
      }
      logMajorEvent('socket', 'socket_close', 'Socket closed.', {
        socketId: socketState.socketId,
        peers: getPeerCount(),
        connections: activeConnections,
        remoteKey,
      });
    });

    socket.on?.('data', (chunk) => {
      const now = Date.now();
      socketState.lastDataAt = now;
      if (!socketState.firstByteAt) {
        socketState.firstByteAt = now;
        socketState.handshakeOk = true;
        emitSocketStatus('handshake_ok', socketState);
        logMajorEvent(
          'socket',
          'first_byte_received',
          'Socket first byte received.',
          {
            socketId: socketState.socketId,
            remoteKey,
            bytes: chunk?.byteLength ?? chunk?.length ?? null,
          },
        );
      }

      if (!discoveryOnlyMode) return;

      const raw = typeof chunk === 'string' ? chunk : b4a.toString(chunk);
      discoveryBuffer += raw;
      let newlineIndex = discoveryBuffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = discoveryBuffer.slice(0, newlineIndex).trim();
        discoveryBuffer = discoveryBuffer.slice(newlineIndex + 1);
        if (line === PING_FRAME) {
          sendSocketFrame(socket, socketState, PONG_FRAME, 'pong_sent');
        } else if (line === PONG_FRAME) {
          socketState.lastPongAt = Date.now();
          socketState.pingOutstanding = false;
          socketState.timeoutReportedNoPong = false;
          logMajorEvent('socket', 'pong_received', 'Socket pong received.', {
            socketId: socketState.socketId,
            remoteKey,
          });
        }
        newlineIndex = discoveryBuffer.indexOf('\n');
      }
    });

    try {
      if (!discoveryOnlyMode && base) {
        socketState.replicationStarted = true;
        emitSocketStatus('replicating', socketState);
        logMajorEvent(
          'socket',
          'replication_started',
          'Corestore/Autobase replication started on socket.',
          {
            socketId: socketState.socketId,
            remoteKey,
          },
        );
        const connection = base.replicate(socket);
        connection.on('remote-core', (core, peerKey) => {
          if (!core.writable && peerKey) {
            base.ackWriter(peerKey).catch((err) => {
              logMajorWarning('ack', 'ack_writer_failed', getErrorMessage(err));
            });
          }
        });
      }
    } catch (error) {
      logBackendError('replicate', error);
      emitStatus('error', getErrorMessage(error));
    }

    if (discoveryOnlyMode) {
      sendSocketFrame(socket, socketState, PING_FRAME, 'ping_sent');
      socketState.pingTimer = setInterval(() => {
        if (socketState.closed) {
          clearSocketPingTimer(socketState);
          return;
        }
        if (!socketState.pingOutstanding) {
          sendSocketFrame(socket, socketState, PING_FRAME, 'ping_sent');
        }
      }, PING_INTERVAL_MS);
    }

    socket.on?.('error', (error) => {
      logMajorWarning('socket', 'socket_error', getErrorMessage(error), {
        socketId: socketState.socketId,
        remoteKey,
      });
      if (isTransientSocketError(error)) {
        const message = getErrorMessage(error);
        logMajorWarning('socket', 'timeout', message, {
          socketId: socketState.socketId,
          peers: getPeerCount(),
          connections: activeConnections,
          remoteKey,
        });
        if (runtimeStatus !== 'error') {
          emitStatus(activeConnections > 0 ? 'synced' : 'connecting', null);
        }
        return;
      }
      logBackendError('socket', error);
      emitStatus('error', getErrorMessage(error));
    });

    if (!discoveryOnlyMode) {
      // Announce presence so the new peer flips to 'synced' promptly.
      void publishBackendPresence();
    }
  });

  currentTopic = topic;
  logMajorEvent('swarm', 'join_requested', 'Joining swarm topic.', {
    topicHex,
  });
  discovery = swarm.join(topic, { server: true, client: true });
  await discovery.flushed();
  emitStatus('dht_ready', null);
  logMajorEvent('dht', 'dht_ready', 'Discovery flush completed.', {
    topicHex,
    bootstrapped: isDhtBootstrapped(),
  });

  startedAt = Date.now();
  stuckSince = Date.now();
  lastDhtBootstrapped = isDhtBootstrapped();
  emitStatus('connecting', null);
  logMajorEvent('backend', 'started', 'Sync backend started.', {
    storageRoot,
    autobaseKey: base?.key ? b4a.toString(base.key, 'hex') : null,
    localWriterKey: base?.local?.key
      ? b4a.toString(base.local.key, 'hex')
      : null,
    swarmPublicKey,
    dhtReady: lastDhtBootstrapped,
    discoveryOnlyMode,
  });
  startHeartbeat();

  return {
    bootstrapKeyHex: base?.key ? b4a.toString(base.key, 'hex') : '',
  };
}

rpc = new RPC(IPC, async (req) => {
  try {
    if (!rpcHandshakeLogged) {
      rpcHandshakeLogged = true;
      logMajorEvent('rpc', 'handshake', 'First RPC request received.', {
        command: req.command,
      });
    }

    if (req.command === RPC_SYNC_START) {
      const config = decodeRequest(req);
      const result = await startSync(config);
      safeReply(req, result);
      return;
    }

    if (req.command === RPC_SYNC_STOP) {
      await ensureStopped();
      emitStatus('idle', null);
      logMajorEvent('backend', 'stopped', 'Sync backend stopped.');
      safeReply(req, { ok: true });
      return;
    }

    if (req.command === RPC_SYNC_STATUS) {
      safeReply(req, buildStatus());
      return;
    }

    if (req.command === RPC_SYNC_GET_LOGS) {
      safeReply(req, { entries: logRing.slice() });
      return;
    }

    if (req.command === RPC_SYNC_PUBLISH) {
      const op = decodeRequest(req);
      if (discoveryOnlyMode) {
        logMajorEvent(
          'publish',
          'ignored_discovery_only',
          'Ignoring publish in discovery-only mode.',
        );
        safeReply(req, { ok: true });
        return;
      }
      if (!base) {
        throw new Error('Sync base not started.');
      }
      await base.append(op, { optimistic: true });
      // Note: do NOT advance lastSyncedAt here — that reflects remote activity.
      safeReply(req, { ok: true });
      return;
    }

    safeReply(req, { ok: false, error: 'Unknown command' });
  } catch (error) {
    logBackendError('rpc', error);
    const message = getErrorMessage(error) || 'Sync backend error';
    emitStatus('error', message);
    safeReply(req, { ok: false, error: message });
  }
});

try {
  const p = typeof process !== 'undefined' ? process : null;
  if (p?.on) {
    p.on('uncaughtException', (error) => {
      logMajorWarning(
        'fatal',
        'uncaught_exception',
        'Unhandled fatal exception in backend.',
        { message: getErrorMessage(error) },
      );
      logBackendError('uncaughtException', error);
      emitStatus('error', getErrorMessage(error));
    });
    p.on('unhandledRejection', (error) => {
      logMajorWarning(
        'fatal',
        'unhandled_rejection',
        'Unhandled promise rejection in backend.',
        { message: getErrorMessage(error) },
      );
      logBackendError('unhandledRejection', error);
      emitStatus('error', getErrorMessage(error));
    });
  }
} catch {
  // ignore
}

try {
  const p = typeof process !== 'undefined' ? process : null;
  const bareVersion =
    typeof globalThis !== 'undefined' && globalThis.Bare?.version
      ? globalThis.Bare.version
      : null;
  logMajorEvent('worklet', 'boot', 'Sync worklet booted.', {
    workletStartAt: WORKLET_BOOT_AT,
    argv: p?.argv ?? null,
    bareVersion,
  });
} catch {
  // ignore
}

goodbye(async () => {
  await ensureStopped();
});
