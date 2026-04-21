/* global BareKit */

import Autobase from 'autobase';
import b4a from 'b4a';
import { mkdir } from 'bare-fs/promises';
import { join } from 'bare-path';
import RPC from 'bare-rpc';
import Corestore from 'corestore';
import goodbye from 'graceful-goodbye';
import Hyperswarm from 'hyperswarm';
import {
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
let peers = 0;
let rpc = null;
let sentViewLength = 0;
let isFlushing = false;
let _hasReceivedUpdate = false;
let lastBackendError = null;

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

function emitLog(level, scope, error) {
  if (!rpc) return;
  try {
    const message = getErrorMessage(error);
    const event = rpc.event(RPC_SYNC_LOG_EVENT);
    event.send(
      JSON.stringify({
        level: level || 'error',
        scope: scope || 'unknown',
        message,
      }),
    );
  } catch {
    // ignore
  }
}

function logBackendError(scope, error) {
  lastBackendError = getErrorMessage(error);
  emitLog('error', scope, error);
  try {
    // eslint-disable-next-line no-console
    console.error(`[pearlift-sync/${scope}]`, error?.stack ?? error);
  } catch {
    // ignore
  }
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

function emitStatus(status = 'synced', lastError = null) {
  if (!rpc) return;
  if (lastError) {
    lastBackendError = lastError;
  }
  const event = rpc.event(RPC_SYNC_STATUS_EVENT);
  event.send(
    JSON.stringify({
      status,
      peers,
      lastSyncedAt: new Date().toISOString(),
      lastError: lastError ?? lastBackendError,
    }),
  );
}

async function flushRemoteOps() {
  if (!rpc || !base?.view) return;
  if (isFlushing) return;

  isFlushing = true;
  try {
    const total = base.view.length;
    while (sentViewLength < total) {
      const op = await base.view.get(sentViewLength++);
      const event = rpc.event(RPC_SYNC_REMOTE_OP_EVENT);
      event.send(JSON.stringify(op));
    }
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

async function ensureStopped() {
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

  peers = 0;
  sentViewLength = 0;
  isFlushing = false;
  _hasReceivedUpdate = false;
}

async function startSync(config) {
  await ensureStopped();

  const topic = topicFromSecretHex(config.pairingSecretHex);
  const basePath = normalizeStoragePath(config.storagePath);
  if (!basePath) {
    throw new Error('Missing storagePath');
  }
  const storageRoot = join(basePath, 'pearlift-sync');
  await mkdir(storageRoot, { recursive: true });

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

        // Accept writers that share the pairing secret and append optimistic ops.
        await host.ackWriter(node.from.key);
        await view.append(node.value);
      }
    },
  });

  await base.ready();
  sentViewLength = base.view.length;

  base.on('update', () => {
    void flushRemoteOps()
      .then(() => {
        _hasReceivedUpdate = true;
        emitStatus('synced');
      })
      .catch((error) => {
        logBackendError('flushRemoteOps', error);
        emitStatus('error', getErrorMessage(error));
      });
  });

  swarm = new Hyperswarm();
  swarm.on('connection', (socket) => {
    peers += 1;
    emitStatus('connecting');

    socket.once('close', () => {
      peers = Math.max(0, peers - 1);
      emitStatus('connecting');
    });

    try {
      store.replicate(socket);
    } catch (error) {
      logBackendError('replicate', error);
      emitStatus('error', getErrorMessage(error));
    }
    socket.on?.('error', (error) => {
      logBackendError('socket', error);
      emitStatus('error', getErrorMessage(error));
    });
  });

  swarm.join(topic, { server: true, client: true });
  await swarm.flush();

  emitStatus('connecting');

  return {
    bootstrapKeyHex: b4a.toString(base.key, 'hex'),
  };
}

rpc = new RPC(IPC, async (req) => {
  try {
    if (req.command === RPC_SYNC_START) {
      const config = parseData(req.data);
      const result = await startSync(config);
      safeReply(req, result);
      return;
    }

    if (req.command === RPC_SYNC_STOP) {
      await ensureStopped();
      emitStatus('idle');
      safeReply(req, { ok: true });
      return;
    }

    if (req.command === RPC_SYNC_STATUS) {
      safeReply(req, {
        status: base ? 'synced' : 'idle',
        peers,
        lastSyncedAt: null,
        lastError: lastBackendError,
      });
      return;
    }

    if (req.command === RPC_SYNC_PUBLISH) {
      const op = parseData(req.data);
      if (!base) {
        throw new Error('Sync base not started.');
      }
      await base.append(op, { optimistic: true });
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

// Best-effort global crash boundaries so failures show up in logs + UI.
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

goodbye(async () => {
  await ensureStopped();
});
