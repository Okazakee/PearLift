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

const { IPC } = BareKit;

let store = null;
let base = null;
let swarm = null;
let discovery = null;
let currentTopic = null;
const peerKeys = new Set();
let rpc = null;
let sentViewLength = 0;
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

const MAX_LOG_ENTRIES = 200;
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL_MS = 5000;
const WATCHDOG_STUCK_THRESHOLD_MS = 45000;
const logRing = [];

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
    rpcEvent.send(
      JSON.stringify({
        level: level || 'error',
        scope: scope || 'unknown',
        event: eventName || 'event',
        message,
        details,
      }),
    );
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

function parseData(data) {
  if (!data) return null;
  if (typeof data === 'string') return JSON.parse(data);
  return JSON.parse(b4a.toString(data));
}

function safeReply(req, payload) {
  if (req?.sent) return;
  req.reply(JSON.stringify(payload ?? {}));
}

function isDhtBootstrapped() {
  try {
    return !!swarm?.dht?.bootstrapped;
  } catch {
    return false;
  }
}

function buildStatus(status = runtimeStatus, lastError = lastBackendError) {
  return {
    status,
    peers: peerKeys.size,
    peerKeys: Array.from(peerKeys),
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
  rpcEvent.send(JSON.stringify(buildStatus(status, lastError)));
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
  if (!rpc || !base?.view) return;
  if (isFlushing) return;

  isFlushing = true;
  try {
    const total = base.view.length;
    let flushed = 0;
    while (sentViewLength < total) {
      const op = await base.view.get(sentViewLength++);
      // Don't ship our own ops back to the UI.
      if (op?.deviceId && localDeviceId && op.deviceId === localDeviceId) {
        continue;
      }
      const rpcEvent = rpc.event(RPC_SYNC_REMOTE_OP_EVENT);
      rpcEvent.send(JSON.stringify(op));
      flushed += 1;
    }
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
  if (runtimeStatus === 'connecting' && peerKeys.size === 0) {
    if (stuckSince === null) stuckSince = Date.now();
  } else {
    stuckSince = null;
  }
}

async function rejoinTopic() {
  if (!swarm || !currentTopic) return;
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
  logMajorEvent('watchdog', 'rejoin', 'Forcing topic rejoin.', {
    attempt: reconnectAttempts,
    peers: peerKeys.size,
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
    void discovery
      .flushed()
      .then(() => {
        logMajorEvent(
          'swarm',
          'topic_reannounced',
          'Swarm topic re-announced after watchdog rejoin.',
        );
      })
      .catch((error) => {
        logMajorWarning('swarm', 'flush_failed', getErrorMessage(error));
      });
    stuckSince = Date.now();
  } catch (error) {
    logBackendError('watchdog', error);
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
      peers: peerKeys.size,
      dhtReady,
      elapsedMs: elapsed,
      status: runtimeStatus,
      reconnectAttempts,
    });
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

  if (swarm) {
    try {
      await swarm.destroy();
    } catch {
      // ignore
    }
    swarm = null;
  }

  if (base) {
    try {
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

  peerKeys.clear();
  sentViewLength = 0;
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
  stopHeartbeat();
}

async function startSync(config) {
  await ensureStopped();
  runtimeStatus = 'connecting';
  lastBackendError = null;
  lastSyncedAt = null;

  const topic = topicFromSecretHex(config.pairingSecretHex);
  topicHex = b4a.toString(topic, 'hex');
  const basePath = normalizeStoragePath(config.storagePath);
  if (!basePath) {
    throw new Error('Missing storagePath');
  }
  storageRoot = join(basePath, 'pearlift-sync');
  await mkdir(storageRoot, { recursive: true });
  localDeviceId = config.deviceId ?? null;

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
  sentViewLength = Math.min(storedCursor, base.view.length);
  logMajorEvent('cursor', 'restored', 'Cursor restored from disk.', {
    stored: storedCursor,
    applied: sentViewLength,
    viewLength: base.view.length,
  });
  logMajorEvent('autobase', 'ready', 'Autobase ready.', {
    viewLength: base.view.length,
    writable: !!base.writable,
  });

  base.on('update', () => {
    void flushRemoteOps().catch((error) => {
      logBackendError('flushRemoteOps', error);
      emitStatus('error', getErrorMessage(error));
    });
  });

  swarm = new Hyperswarm();

  swarm.on('error', (error) => {
    logBackendError('swarm', error);
    emitStatus('error', getErrorMessage(error));
  });

  swarm.on('update', () => {
    logMajorEvent('swarm', 'update', 'Swarm peer discovery updated.', {
      peers: peerKeys.size,
    });
  });

  swarm.on('connection', (socket, peerInfo) => {
    const remoteKeyBuf = peerInfo?.publicKey ?? socket.remotePublicKey;
    const remoteKey = remoteKeyBuf ? b4a.toString(remoteKeyBuf, 'hex') : null;
    if (remoteKey && peerKeys.has(remoteKey)) {
      // Duplicate connection event — treat as noop.
      try {
        store.replicate(socket);
      } catch (error) {
        logBackendError('replicate', error);
      }
      return;
    }
    if (remoteKey) peerKeys.add(remoteKey);

    stuckSince = null;
    const nextStatus = runtimeStatus === 'error' ? 'error' : 'connecting';
    emitStatus(nextStatus, runtimeStatus === 'error' ? lastBackendError : null);
    logMajorEvent('peer', 'connected', 'Peer connected.', {
      peers: peerKeys.size,
      remoteKey,
    });

    socket.once('close', () => {
      if (remoteKey) peerKeys.delete(remoteKey);
      if (runtimeStatus !== 'error') {
        const statusAfterClose =
          peerKeys.size > 0 && runtimeStatus === 'synced'
            ? 'synced'
            : peerKeys.size > 0
              ? 'synced'
              : 'connecting';
        emitStatus(statusAfterClose, lastBackendError);
      } else {
        emitStatus('error', lastBackendError);
      }
      logMajorEvent('peer', 'disconnected', 'Peer disconnected.', {
        peers: peerKeys.size,
      });
    });

    try {
      store.replicate(socket);
    } catch (error) {
      logBackendError('replicate', error);
      emitStatus('error', getErrorMessage(error));
    }

    socket.on?.('error', (error) => {
      if (isTransientSocketError(error)) {
        const message = getErrorMessage(error);
        logMajorWarning('socket', 'timeout', message, { peers: peerKeys.size });
        emitStatus(peerKeys.size > 0 ? 'synced' : 'connecting', null);
        return;
      }
      logBackendError('socket', error);
      emitStatus('error', getErrorMessage(error));
    });

    // Announce presence so the new peer flips to 'synced' promptly.
    void publishBackendPresence();
  });

  currentTopic = topic;
  logMajorEvent('swarm', 'join_requested', 'Joining swarm topic.', {
    topicHex,
  });
  discovery = swarm.join(topic, { server: true, client: true });

  // Don't block start on DHT flush. Log in the background.
  void discovery
    .flushed()
    .then(() => {
      logMajorEvent('swarm', 'topic_announced', 'Swarm topic announced.');
    })
    .catch((error) => {
      logMajorWarning('swarm', 'flush_failed', getErrorMessage(error));
    });

  startedAt = Date.now();
  stuckSince = Date.now();
  lastDhtBootstrapped = isDhtBootstrapped();
  emitStatus('connecting', null);
  logMajorEvent('backend', 'started', 'Sync backend started.', {
    dhtReady: lastDhtBootstrapped,
  });
  startHeartbeat();

  return {
    bootstrapKeyHex: b4a.toString(base.key, 'hex'),
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
      const config = parseData(req.data);
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
      const op = parseData(req.data);
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
      logBackendError('uncaughtException', error);
      emitStatus('error', getErrorMessage(error));
    });
    p.on('unhandledRejection', (error) => {
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
    argv: p?.argv ?? null,
    bareVersion,
  });
} catch {
  // ignore
}

goodbye(async () => {
  await ensureStopped();
});
