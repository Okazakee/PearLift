/* global BareKit */

import Autobase from 'autobase';
import b4a from 'b4a';
import { mkdir, readFile, rm, writeFile } from 'bare-fs/promises';
import { join } from 'bare-path';
import RPC from 'bare-rpc';
import Corestore from 'corestore';
import goodbye from 'graceful-goodbye';
import Hyperswarm from 'hyperswarm';
import { getStreamError } from 'streamx';
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
let sentRemoteOpOrder = [];
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
let retryTimer = null;
let lifecycleQueue = Promise.resolve();
let lifecyclePhase = 'idle';
let activeStartFingerprint = null;
let appendReady = false;
let queuedPublishes = [];
let queuedPublishOpIds = new Set();
let flushQueuedPublishesInFlight = false;
let degraded = false;
let degradedReason = null;
let degradedSince = null;
let degradedRetryDelayMs = 10000;
let degradedRetryTimer = null;

const MAX_LOG_ENTRIES = 100;
const MAX_SENT_REMOTE_OP_IDS = 5000;
const MAX_QUEUED_PUBLISH_OPS = 200;
const HEARTBEAT_INTERVAL_MS = 5000;
const WATCHDOG_STUCK_THRESHOLD_MS = 45000;
const WAITING_STATUS_THRESHOLD_ATTEMPTS = 3;
const RETRY_BACKOFF_SECS = [30, 60, 120, 300, 600];
const DEGRADED_RETRY_INITIAL_MS = 10000;
const DEGRADED_RETRY_MAX_MS = 60000;
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
let outboundDialSeq = 0;
const runtimeDeviceTag = `run-${Math.floor(Math.random() * 0x10000)
  .toString(16)
  .padStart(4, '0')}`;
let activeDeviceTag = runtimeDeviceTag;

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
    deviceTag: activeDeviceTag,
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
      deviceTag: activeDeviceTag,
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
    console.error(
      `[pearlift-sync][dev:${activeDeviceTag}][${scope}]`,
      error?.stack ?? error,
    );
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

function currentBootstrapKeyHex() {
  return base?.key ? b4a.toString(base.key, 'hex') : '';
}

function hasActiveBackendResources() {
  return !!(store || base || swarm || discovery);
}

function getSwarmDiagnostics() {
  return {
    connecting: swarm?.connecting ?? null,
    totalConnections: swarm?.connections?.size ?? null,
    knownPeers: swarm?.peers?.size ?? null,
    explicitPeers: swarm?.explicitPeers?.size ?? null,
    queuedPeers: swarm?._queue?.length ?? null,
    clientConnections: swarm?._clientConnections ?? null,
    serverConnections: swarm?._serverConnections ?? null,
    maxPeers: swarm?.maxPeers ?? null,
    stats: swarm?.stats
      ? {
          updates: swarm.stats.updates,
          bannedPeers: swarm.stats.bannedPeers,
          clientAttempted: swarm.stats.connects?.client?.attempted ?? null,
          clientOpened: swarm.stats.connects?.client?.opened ?? null,
          clientClosed: swarm.stats.connects?.client?.closed ?? null,
          serverOpened: swarm.stats.connects?.server?.opened ?? null,
          serverClosed: swarm.stats.connects?.server?.closed ?? null,
        }
      : null,
  };
}

function getDiscoveryDiagnostics() {
  const internalDiscovery = discovery?.discovery ?? discovery ?? null;
  return {
    sessionClient: discovery?.isClient ?? null,
    sessionServer: discovery?.isServer ?? null,
    destroyed: !!discovery?.destroyed,
    internalIsClient: internalDiscovery?.isClient ?? null,
    internalIsServer: internalDiscovery?.isServer ?? null,
    suspended: internalDiscovery?.suspended ?? null,
    refreshes: internalDiscovery?._refreshes ?? null,
    discoveredCacheSize: internalDiscovery?._discovered?.size ?? null,
    clientSessions: internalDiscovery?._clientSessions ?? null,
    serverSessions: internalDiscovery?._serverSessions ?? null,
    needsUnannounce: internalDiscovery?._needsUnannounce ?? null,
    closestNodesCount: Array.isArray(internalDiscovery?._closestNodes)
      ? internalDiscovery._closestNodes.length
      : 0,
    hasActiveQuery: !!internalDiscovery?._activeQuery,
    hasCurrentRefresh: !!internalDiscovery?._currentRefresh,
  };
}

function attachOutboundDialDebug(conn, context) {
  if (!conn || !context) return conn;
  outboundDialSeq += 1;
  const dialId = outboundDialSeq;
  const startedAtMs = Date.now();
  let opened = false;

  logMajorEvent(
    'dial',
    'attempt_started',
    'Outbound peer dial attempt started.',
    {
      dialId,
      peerKey: context.peerKey,
      queued: context.queued,
      attempts: context.attempts,
      priority: context.priority,
      forceRelaying: context.forceRelaying,
      relayAddressesCount: context.relayAddressesCount,
      topics: context.topics,
    },
  );

  conn.on?.('open', () => {
    opened = true;
    logMajorEvent('dial', 'attempt_opened', 'Outbound peer dial opened.', {
      dialId,
      peerKey: context.peerKey,
      elapsedMs: Date.now() - startedAtMs,
      rawBytesRead: conn.rawBytesRead ?? null,
      rawBytesWritten: conn.rawBytesWritten ?? null,
    });
  });

  conn.on?.('error', (error) => {
    logMajorWarning('dial', 'attempt_error', getErrorMessage(error), {
      dialId,
      peerKey: context.peerKey,
      elapsedMs: Date.now() - startedAtMs,
      code: error?.code ?? null,
      forceRelaying: context.forceRelaying,
    });
  });

  conn.on?.('close', () => {
    const error = getStreamError(conn);
    logMajorWarning(
      'dial',
      opened ? 'attempt_closed_after_open' : 'attempt_closed_before_open',
      opened
        ? 'Outbound peer dial closed after open.'
        : 'Outbound peer dial closed before open.',
      {
        dialId,
        peerKey: context.peerKey,
        elapsedMs: Date.now() - startedAtMs,
        error: error ? getErrorMessage(error) : null,
        errorCode: error?.code ?? null,
        rawBytesRead: conn.rawBytesRead ?? null,
        rawBytesWritten: conn.rawBytesWritten ?? null,
        attempts: context.attempts,
        forceRelaying: context.forceRelaying,
      },
    );
  });

  return conn;
}

function instrumentSwarmOutboundDialing() {
  if (!swarm?.dht?.connect || !swarm?._connect) return;
  const originalSwarmConnect = swarm._connect.bind(swarm);
  const originalDhtConnect = swarm.dht.connect.bind(swarm.dht);
  let currentConnectContext = null;

  swarm.dht.connect = (...args) => {
    const conn = originalDhtConnect(...args);
    return attachOutboundDialDebug(conn, currentConnectContext);
  };

  swarm._connect = (peerInfo, queued) => {
    currentConnectContext = {
      peerKey: peerInfo?.publicKey
        ? b4a.toString(peerInfo.publicKey, 'hex')
        : null,
      queued: !!queued,
      attempts: peerInfo?.attempts ?? null,
      priority: peerInfo?.priority ?? null,
      forceRelaying: !!peerInfo?.forceRelaying,
      relayAddressesCount: Array.isArray(peerInfo?.relayAddresses)
        ? peerInfo.relayAddresses.length
        : 0,
      topics: Array.isArray(peerInfo?.topics)
        ? peerInfo.topics.map((topic) => b4a.toString(topic, 'hex'))
        : [],
    };
    try {
      return originalSwarmConnect(peerInfo, queued);
    } finally {
      currentConnectContext = null;
    }
  };
}

function createStartFingerprint(config) {
  return JSON.stringify({
    pairingSecretHex: config?.pairingSecretHex ?? null,
    deviceId: config?.deviceId ?? null,
    role: config?.role ?? null,
    bootstrapKeyHex: config?.bootstrapKeyHex ?? null,
    storagePath: config?.storagePath ?? null,
    discoveryOnly: !!config?.debug?.discoveryOnly,
    disableCursorOptimization: !!config?.debug?.disableCursorOptimization,
  });
}

async function withLifecycleLock(_opName, fn) {
  const previous = lifecycleQueue;
  let release = null;
  lifecycleQueue = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release?.();
  }
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
    swarm: getSwarmDiagnostics(),
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

function getSyncMode() {
  return degraded ? 'degraded' : 'normal';
}

function clearDegradedRetryTimer() {
  if (!degradedRetryTimer) return;
  clearTimeout(degradedRetryTimer);
  degradedRetryTimer = null;
}

function clearPublishQueue() {
  queuedPublishes = [];
  queuedPublishOpIds = new Set();
}

function isTracerNullError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("reading 'tracer'") ||
    message.includes('reading "tracer"') ||
    (message.includes('cannot read properties of null') &&
      message.includes('tracer'))
  );
}

function isAppendReady() {
  if (discoveryOnlyMode) return false;
  if (!base || !appendReady) return false;
  return lifecyclePhase === 'running';
}

function dedupePublishOpId(op) {
  return typeof op?.opId === 'string' && op.opId.length > 0 ? op.opId : null;
}

function queuePublishOp(op, source, reason) {
  const opId = dedupePublishOpId(op);
  if (opId && queuedPublishOpIds.has(opId)) {
    logMajorEvent(
      'publish',
      'publish_queued_not_ready',
      'Publish already queued; skipping duplicate opId.',
      {
        source,
        reason,
        opId,
        queueSize: queuedPublishes.length,
        lifecyclePhase,
        runtimeStatus,
      },
    );
    return false;
  }

  if (queuedPublishes.length >= MAX_QUEUED_PUBLISH_OPS) {
    const dropped = queuedPublishes.shift();
    if (dropped?.opId) {
      queuedPublishOpIds.delete(dropped.opId);
    }
    logMajorWarning(
      'publish',
      'publish_queue_overflow',
      'Publish queue full; dropped oldest queued publish.',
      {
        droppedOpId: dropped?.opId ?? null,
        source,
        reason,
        limit: MAX_QUEUED_PUBLISH_OPS,
      },
    );
  }

  queuedPublishes.push({
    op,
    source,
    reason,
    opId,
    enqueuedAt: Date.now(),
  });
  if (opId) {
    queuedPublishOpIds.add(opId);
  }

  logMajorEvent(
    'publish',
    'publish_queued_not_ready',
    'Publish queued until append pipeline is ready.',
    {
      source,
      reason,
      opId,
      queueSize: queuedPublishes.length,
      lifecyclePhase,
      runtimeStatus,
      appendReady,
      degraded,
    },
  );
  return true;
}

function enterDegradedMode(reason) {
  const nextReason = reason || 'Append failed in degraded-safe path.';
  if (!degraded) {
    degraded = true;
    degradedSince = Date.now();
    degradedRetryDelayMs = DEGRADED_RETRY_INITIAL_MS;
    logMajorWarning(
      'sync',
      'sync_degraded_enter',
      'Sync backend entered degraded mode after append failure.',
      {
        reason: nextReason,
        queueSize: queuedPublishes.length,
      },
    );
  }
  degradedReason = nextReason;
  emitStatus(runtimeStatus, lastBackendError);
}

function exitDegradedMode() {
  if (!degraded) return;
  degraded = false;
  degradedReason = null;
  degradedSince = null;
  degradedRetryDelayMs = DEGRADED_RETRY_INITIAL_MS;
  clearDegradedRetryTimer();
  logMajorEvent(
    'sync',
    'sync_degraded_exit',
    'Sync backend exited degraded mode after successful append.',
  );
  emitStatus(runtimeStatus, lastBackendError);
}

function scheduleDegradedRetry(trigger) {
  if (!degraded) return;
  if (degradedRetryTimer) return;
  const delayMs = Math.min(degradedRetryDelayMs, DEGRADED_RETRY_MAX_MS);
  logMajorEvent(
    'sync',
    'sync_degraded_retry',
    'Scheduling degraded-mode publish retry.',
    {
      trigger,
      delayMs,
      queueSize: queuedPublishes.length,
      reason: degradedReason,
    },
  );
  degradedRetryTimer = setTimeout(() => {
    degradedRetryTimer = null;
    void flushQueuedPublishes('degraded_retry').catch((error) => {
      logBackendError('degradedRetry', error);
    });
  }, delayMs);
  degradedRetryDelayMs = Math.min(delayMs * 2, DEGRADED_RETRY_MAX_MS);
}

async function appendSafe(op, source) {
  if (!base) {
    throw new Error('Sync base not started.');
  }

  logMajorEvent('publish', 'append_attempt', 'Attempting local sync append.', {
    source,
    opId: op?.opId ?? null,
    type:
      op?.payload?.kind === 'mutation'
        ? op.payload.mutation?.type
        : op?.payload?.kind,
    deviceId: op?.deviceId ?? null,
    lifecyclePhase,
    runtimeStatus,
    queueSize: queuedPublishes.length,
    degraded,
  });

  try {
    await base.append(op, { optimistic: true });
    return { ok: true, kind: 'appended', message: null };
  } catch (error) {
    const message = getErrorMessage(error);
    if (isTracerNullError(error)) {
      logMajorWarning(
        'publish',
        'append_failed_tracer',
        'Append failed with tracer-null failure; entering degraded mode.',
        {
          source,
          opId: op?.opId ?? null,
          message,
        },
      );
      enterDegradedMode(message);
      return { ok: false, kind: 'tracer', message };
    }

    logMajorWarning(
      'publish',
      'append_failed_other',
      'Append failed with non-tracer error.',
      {
        source,
        opId: op?.opId ?? null,
        message,
      },
    );
    throw error;
  }
}

async function flushQueuedPublishes(trigger) {
  if (flushQueuedPublishesInFlight) return;
  if (!isAppendReady()) return;
  if (queuedPublishes.length === 0) return;

  flushQueuedPublishesInFlight = true;
  let processed = 0;
  const initialSize = queuedPublishes.length;
  logMajorEvent(
    'publish',
    'publish_flush_start',
    'Flushing queued publishes.',
    {
      trigger,
      queueSize: initialSize,
      degraded,
      reason: degradedReason,
    },
  );

  try {
    while (queuedPublishes.length > 0 && isAppendReady()) {
      const entry = queuedPublishes[0];
      const result = await appendSafe(entry.op, `${entry.source}:flush`);
      if (!result.ok) {
        if (result.kind === 'tracer') {
          scheduleDegradedRetry('flush_tracer');
          break;
        }
      }
      queuedPublishes.shift();
      if (entry.opId) {
        queuedPublishOpIds.delete(entry.opId);
      }
      processed += 1;
    }
  } finally {
    flushQueuedPublishesInFlight = false;
    logMajorEvent(
      'publish',
      'publish_flush_done',
      'Queued publish flush finished.',
      {
        trigger,
        processed,
        remaining: queuedPublishes.length,
        degraded,
        reason: degradedReason,
      },
    );
  }

  if (processed > 0 && degraded) {
    exitDegradedMode();
  }
  if (queuedPublishes.length > 0 && degraded) {
    scheduleDegradedRetry('flush_incomplete');
  }
}

async function appendOrQueue(op, source) {
  if (!isAppendReady() || degraded) {
    const reason = degraded ? 'degraded_mode' : 'append_not_ready';
    queuePublishOp(op, source, reason);
    if (degraded) {
      scheduleDegradedRetry(reason);
    }
    return { ok: true, kind: 'queued', message: null };
  }

  const result = await appendSafe(op, source);
  if (!result.ok) {
    if (result.kind === 'tracer') {
      queuePublishOp(op, source, 'append_failed_tracer');
      scheduleDegradedRetry('append_failed_tracer');
      return { ok: true, kind: 'queued', message: result.message };
    }
    return result;
  }

  if (queuedPublishes.length > 0) {
    void flushQueuedPublishes('post_append').catch((error) => {
      logBackendError('flushQueuedPublishes', error);
    });
  }
  if (degraded) {
    exitDegradedMode();
  }
  return result;
}

function buildStatus(status = runtimeStatus, lastError = lastBackendError) {
  const peerKeys = getPeerKeys();
  return {
    status,
    syncMode: getSyncMode(),
    degradedReason,
    degradedSince,
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

function rememberSentRemoteOpId(opKey) {
  if (sentRemoteOpIds.has(opKey)) return;
  sentRemoteOpIds.add(opKey);
  sentRemoteOpOrder.push(opKey);
  if (sentRemoteOpOrder.length <= MAX_SENT_REMOTE_OP_IDS) return;
  const overflow = sentRemoteOpOrder.length - MAX_SENT_REMOTE_OP_IDS;
  const evicted = sentRemoteOpOrder.splice(0, overflow);
  for (const key of evicted) {
    sentRemoteOpIds.delete(key);
  }
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
    const startIndex = sentViewLength;
    let flushed = 0;
    for (let i = startIndex; i < total; i += 1) {
      const op = await base.view.get(i);
      if (op?.deviceId && localDeviceId && op.deviceId === localDeviceId) {
        continue;
      }
      const opKey =
        typeof op?.opId === 'string' ? op.opId : `${i}:${JSON.stringify(op)}`;
      if (sentRemoteOpIds.has(opKey)) {
        continue;
      }
      rememberSentRemoteOpId(opKey);
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
        startIndex,
        total,
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

function resolveStorageRoot(config) {
  const basePath = normalizeStoragePath(config?.storagePath);
  if (!basePath) {
    throw new Error('Missing storagePath');
  }
  return join(basePath, 'pearlift-sync');
}

function isRecoverableStartupDecodeError(error) {
  const message = getErrorMessage(error);
  if (!message) return false;
  const hasDecodePrefix =
    message.includes('DECODING_ERROR') ||
    message.includes("Cannot read properties of undefined (reading 'decode')");
  if (!hasDecodePrefix) return false;
  return (
    message.includes("reading 'decode'") ||
    message.includes('Out of bounds') ||
    message.includes('Invalid data')
  );
}

async function resetSyncStorageForDecodeRecovery(targetStorageRoot, reason) {
  logMajorWarning(
    'startup',
    'decode_recovery_reset_begin',
    'Resetting sync storage after startup decode failure.',
    {
      storageRoot: targetStorageRoot,
      reason,
    },
  );
  await rm(targetStorageRoot, { recursive: true, force: true });
  await mkdir(targetStorageRoot, { recursive: true });
  logMajorEvent(
    'startup',
    'decode_recovery_reset_done',
    'Sync storage reset completed; retrying startup.',
    {
      storageRoot: targetStorageRoot,
    },
  );
}

async function startSyncWithDecodeRecovery(config) {
  const targetStorageRoot = resolveStorageRoot(config);

  try {
    return await startSync(config);
  } catch (error) {
    if (!isRecoverableStartupDecodeError(error)) {
      throw error;
    }
    const reason = getErrorMessage(error);
    logMajorWarning(
      'startup',
      'decode_recovery_detected',
      'Recoverable startup decode error detected; applying one-time storage reset.',
      {
        reason,
        storageRoot: targetStorageRoot,
      },
    );
    try {
      await ensureStopped();
    } catch {
      // ignore cleanup failures before decode recovery
    }
    await resetSyncStorageForDecodeRecovery(targetStorageRoot, reason);
    return startSync(config);
  }
}

async function publishBackendPresence() {
  if (!base || !localDeviceId) return;
  try {
    const op = {
      schemaVersion: 1,
      opId: `${localDeviceId}:presence:${Date.now()}`,
      deviceId: localDeviceId,
      lamport: Date.now(),
      createdAt: new Date().toISOString(),
      payload: { kind: 'presence' },
    };
    await appendOrQueue(op, 'presence');
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

function scheduleRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const index = Math.min(reconnectAttempts, RETRY_BACKOFF_SECS.length - 1);
  const delayMs = RETRY_BACKOFF_SECS[index] * 1000;
  logMajorEvent('watchdog', 'schedule_retry', 'Scheduling reconnect retry.', {
    attempt: reconnectAttempts,
    delayMs,
  });
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void rejoinTopic();
  }, delayMs);
}

function clearRetryTimer() {
  if (!retryTimer) return;
  clearTimeout(retryTimer);
  retryTimer = null;
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
  reconnectAttempts += 1;
  rejoinInFlight = true;
  logMajorEvent('watchdog', 'rejoin', 'Forcing topic rejoin.', {
    attempt: reconnectAttempts,
    peers: getPeerCount(),
    connections: activeConnections,
    topicHex,
    bootstrapped: isDhtBootstrapped(),
    swarm: getSwarmDiagnostics(),
    discovery: getDiscoveryDiagnostics(),
  });
  try {
    if (discovery) {
      logMajorEvent(
        'swarm',
        'discovery_destroy_before_rejoin',
        'Destroying current discovery handle before rejoin.',
      );
      try {
        await discovery.destroy();
      } catch {
        // ignore
      }
      discovery = null;
    }
    const joinOptions = { server: true, client: true };
    discovery = swarm.join(currentTopic, joinOptions);
    logMajorEvent('swarm', 'join_reissued', 'Re-issued swarm join.', {
      topicHex,
      joinOptions,
      swarm: getSwarmDiagnostics(),
      discovery: getDiscoveryDiagnostics(),
    });
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
      swarm: getSwarmDiagnostics(),
      discovery: getDiscoveryDiagnostics(),
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
      runtimeStatus === 'connecting' &&
      activeConnections === 0 &&
      reconnectAttempts >= WAITING_STATUS_THRESHOLD_ATTEMPTS
    ) {
      emitStatus('waiting', lastBackendError);
      scheduleRetry();
    }
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
    logMajorEvent(
      'shutdown',
      'discovery_destroy',
      'Destroying discovery handle.',
    );
    try {
      await discovery.destroy();
    } catch {
      // ignore
    }
    discovery = null;
  }

  if (swarm) {
    logMajorEvent('shutdown', 'swarm_destroy', 'Destroying swarm.');
    try {
      swarm.removeAllListeners?.();
      await swarm.destroy();
    } catch {
      // ignore
    }
    swarm = null;
  }

  if (base) {
    logMajorEvent('shutdown', 'autobase_close', 'Closing autobase.');
    try {
      base.removeAllListeners?.();
      await base.close();
    } catch {
      // ignore
    }
    base = null;
  }

  if (store) {
    logMajorEvent('shutdown', 'corestore_close', 'Closing corestore.');
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
  sentRemoteOpOrder = [];
  isFlushing = false;
  appendReady = false;
  clearPublishQueue();
  flushQueuedPublishesInFlight = false;
  degraded = false;
  degradedReason = null;
  degradedSince = null;
  degradedRetryDelayMs = DEGRADED_RETRY_INITIAL_MS;
  clearDegradedRetryTimer();
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
  activeDeviceTag = runtimeDeviceTag;
  stopHeartbeat();
  clearRetryTimer();
}

async function startSync(config) {
  await ensureStopped();
  appendReady = false;
  runtimeStatus = 'idle';
  lastBackendError = null;
  lastSyncedAt = null;
  activeDeviceTag = runtimeDeviceTag;

  discoveryOnlyMode = !!config?.debug?.discoveryOnly;
  disableCursorOptimization = !!config?.debug?.disableCursorOptimization;

  const topic = topicFromSecretHex(config.pairingSecretHex);
  topicHex = hashSecretHex(config.pairingSecretHex);
  storageRoot = resolveStorageRoot(config);
  await mkdir(storageRoot, { recursive: true });
  localDeviceId = config.deviceId ?? null;
  activeDeviceTag = localDeviceId ?? runtimeDeviceTag;
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
    role: config.role ?? null,
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

    const openedAutobaseKey = b4a.toString(base.key, 'hex');
    const requestedBootstrapKey =
      typeof config.bootstrapKeyHex === 'string'
        ? config.bootstrapKeyHex.toLowerCase()
        : null;
    if (requestedBootstrapKey && openedAutobaseKey !== requestedBootstrapKey) {
      throw new Error(
        `Opened Autobase key ${openedAutobaseKey} does not match requested bootstrap key ${requestedBootstrapKey}. Reset sync room storage before joining this room.`,
      );
    }

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
      autobaseKey: openedAutobaseKey,
      requestedBootstrapKey,
      localWriterKey: base.local?.key
        ? b4a.toString(base.local.key, 'hex')
        : null,
    });
    logMajorEvent('autobase', 'start_config', 'Start configuration.', {
      hasBootstrapKey: !!config.bootstrapKeyHex,
      bootstrapKeyHexState: config.bootstrapKeyHex ? 'present' : 'absent',
      deviceId: config.deviceId,
      role: config.role ?? null,
      topicHex,
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
  instrumentSwarmOutboundDialing();
  const swarmPublicKey = swarm?.keyPair?.publicKey
    ? b4a.toString(swarm.keyPair.publicKey, 'hex')
    : null;
  logMajorEvent('swarm', 'keypair', 'Swarm keypair initialized.', {
    swarmPublicKey,
    swarm: getSwarmDiagnostics(),
  });

  swarm.on('error', (error) => {
    logBackendError('swarm', error);
    emitStatus('error', getErrorMessage(error));
  });

  swarm.on('ban', (peerInfo, error) => {
    logMajorWarning('swarm', 'peer_banned', 'Swarm peer banned.', {
      peerKey: peerInfo?.publicKey
        ? b4a.toString(peerInfo.publicKey, 'hex')
        : null,
      reason: getErrorMessage(error),
      swarm: getSwarmDiagnostics(),
    });
  });

  swarm.on('update', () => {
    logMajorEvent('swarm', 'update', 'Swarm peer discovery updated.', {
      peers: getPeerCount(),
      connections: activeConnections,
      topicHex,
      bootstrapped: isDhtBootstrapped(),
      swarm: getSwarmDiagnostics(),
      discovery: getDiscoveryDiagnostics(),
    });
  });

  swarm.dht?.on?.('network-change', () => {
    logMajorEvent(
      'dht',
      'network_change',
      'DHT network-change event observed.',
      {
        bootstrapped: isDhtBootstrapped(),
        swarm: getSwarmDiagnostics(),
        discovery: getDiscoveryDiagnostics(),
      },
    );
  });

  swarm.dht?.on?.('network-update', () => {
    logMajorEvent(
      'dht',
      'network_update',
      'DHT network-update event observed.',
      {
        bootstrapped: isDhtBootstrapped(),
        swarm: getSwarmDiagnostics(),
        discovery: getDiscoveryDiagnostics(),
      },
    );
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
    clearRetryTimer();

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
      peerClient: peerInfo?.client ?? null,
      peerServer: peerInfo?.server ?? null,
      socketRemotePublicKey: socket.remotePublicKey
        ? b4a.toString(socket.remotePublicKey, 'hex')
        : null,
      socketRemoteHost: socket.remoteHost ?? null,
      socketRemotePort: socket.remotePort ?? null,
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
            sinceOpenMs: now - socketState.openedAt,
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
        logMajorEvent(
          'socket',
          'replicate_invoked',
          'Called base.replicate on socket.',
          {
            socketId: socketState.socketId,
            remoteKey,
          },
        );
        connection.on('remote-core', (core, peerKey) => {
          logMajorEvent(
            'replication',
            'remote_core',
            'Replication remote-core event.',
            {
              socketId: socketState.socketId,
              remoteKey,
              peerKey: peerKey ? b4a.toString(peerKey, 'hex') : null,
              writable: !!core?.writable,
            },
          );
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
    role: config.role ?? null,
  });
  const joinOptions = { server: true, client: true };
  discovery = swarm.join(topic, joinOptions);
  logMajorEvent('swarm', 'join_called', 'Called swarm.join.', {
    topicHex,
    joinOptions,
    swarm: getSwarmDiagnostics(),
    discovery: getDiscoveryDiagnostics(),
  });
  await discovery.flushed();
  emitStatus('dht_ready', null);
  logMajorEvent('dht', 'dht_ready', 'Discovery flush completed.', {
    topicHex,
    bootstrapped: isDhtBootstrapped(),
    activeConnections,
    peers: getPeerCount(),
    swarm: getSwarmDiagnostics(),
    discovery: getDiscoveryDiagnostics(),
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
  appendReady = true;
  logMajorEvent(
    'publish',
    'append_pipeline_ready',
    'Append pipeline marked ready.',
    {
      lifecyclePhase,
      runtimeStatus,
      queueSize: queuedPublishes.length,
      degraded,
    },
  );
  startHeartbeat();

  return {
    bootstrapKeyHex: currentBootstrapKeyHex(),
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
      const requestFingerprint = createStartFingerprint(config);
      const result = await withLifecycleLock('start', async () => {
        const previousPhase = lifecyclePhase;
        if (
          activeStartFingerprint === requestFingerprint &&
          (lifecyclePhase === 'starting' ||
            lifecyclePhase === 'running' ||
            hasActiveBackendResources())
        ) {
          logMajorWarning(
            'lifecycle',
            'start_deduped',
            'Ignoring duplicate SYNC_START while backend is already active.',
            {
              lifecyclePhase,
              runtimeStatus,
              hasResources: hasActiveBackendResources(),
              hasBootstrapKey: !!currentBootstrapKeyHex(),
            },
          );
          return { bootstrapKeyHex: currentBootstrapKeyHex() };
        }

        lifecyclePhase = 'starting';
        activeStartFingerprint = requestFingerprint;
        logMajorEvent(
          'lifecycle',
          'start_begin',
          'Beginning serialized SYNC_START.',
          {
            previousPhase,
            runtimeStatus,
            hasResources: hasActiveBackendResources(),
          },
        );
        try {
          const startResult = await startSyncWithDecodeRecovery(config);
          lifecyclePhase = 'running';
          void flushQueuedPublishes('lifecycle_running').catch((error) => {
            logBackendError('flushQueuedPublishes', error);
            emitStatus('error', getErrorMessage(error));
          });
          return startResult;
        } catch (error) {
          lifecyclePhase = 'idle';
          activeStartFingerprint = null;
          throw error;
        }
      });
      safeReply(req, result);
      return;
    }

    if (req.command === RPC_SYNC_STOP) {
      await withLifecycleLock('stop', async () => {
        lifecyclePhase = 'stopping';
        await ensureStopped();
        lifecyclePhase = 'idle';
        activeStartFingerprint = null;
      });
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
      const appendResult = await appendOrQueue(op, 'rpc_publish');
      if (appendResult.kind === 'appended') {
        logMajorEvent('publish', 'appended', 'Local sync op appended.', {
          opId: op?.opId ?? null,
          type:
            op?.payload?.kind === 'mutation'
              ? op.payload.mutation?.type
              : op?.payload?.kind,
          deviceId: op?.deviceId ?? null,
          autobaseKey: base?.key ? b4a.toString(base.key, 'hex') : null,
        });
      } else if (appendResult.kind === 'queued') {
        logMajorEvent(
          'publish',
          'queued',
          'Local sync op queued pending append readiness.',
          {
            opId: op?.opId ?? null,
            lifecyclePhase,
            runtimeStatus,
            queueSize: queuedPublishes.length,
            degraded,
            degradedReason,
          },
        );
      }
      // Note: do NOT advance lastSyncedAt here — that reflects remote activity.
      safeReply(req, {
        ok: true,
        queued: appendResult.kind === 'queued',
        syncMode: getSyncMode(),
      });
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
