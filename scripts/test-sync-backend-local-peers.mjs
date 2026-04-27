#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import Autobase from 'autobase';
import b4a from 'b4a';
import Corestore from 'corestore';
import Hyperswarm from 'hyperswarm';

const DEFAULT_TIMEOUT_MS = 30000;
const LOCAL_SWARM_TOPIC = createHash('sha256')
  .update('pearlift-local-sync-test-topic')
  .digest();

function parseArgs(argv) {
  const opts = {
    transport: 'direct',
    replicator: 'base',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    storage: null,
    keep: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--transport') {
      opts.transport = argv[++i] ?? opts.transport;
      continue;
    }
    if (arg === '--replicator') {
      opts.replicator = argv[++i] ?? opts.replicator;
      continue;
    }
    if (arg === '--timeout-ms') {
      opts.timeoutMs = Number(argv[++i] ?? opts.timeoutMs);
      continue;
    }
    if (arg === '--storage') {
      opts.storage = resolve(argv[++i] ?? '');
      continue;
    }
    if (arg === '--keep') {
      opts.keep = true;
      continue;
    }
    if (arg === '--verbose') {
      opts.verbose = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!['direct', 'swarm'].includes(opts.transport)) {
    throw new Error('--transport must be "direct" or "swarm".');
  }
  if (!['base', 'store'].includes(opts.replicator)) {
    throw new Error('--replicator must be "base" or "store".');
  }
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive number.');
  }

  return opts;
}

function printHelp() {
  console.log(`Usage: node scripts/test-sync-backend-local-peers.mjs [options]

Options:
  --transport direct|swarm   direct pipes streams in-process; swarm uses Hyperswarm DHT. Default: direct
  --replicator base|store    base matches Autobase wakeup replication; store is a diagnostic mode. Default: base
  --timeout-ms <ms>          timeout for each wait. Default: ${DEFAULT_TIMEOUT_MS}
  --storage <path>           storage root to reuse. Default: temp directory
  --keep                     keep storage after the run
  --verbose                  print per-peer events
`);
}

function log(step, details = null) {
  if (details === null) {
    console.log(`[sync-local] ${step}`);
    return;
  }
  console.log(`[sync-local] ${step}`, details);
}

function makeOp(deviceId, n, kind = 'mutation') {
  return {
    schemaVersion: 1,
    opId: `${deviceId}:${n}`,
    deviceId,
    lamport: n,
    createdAt: new Date().toISOString(),
    payload:
      kind === 'presence'
        ? { kind: 'presence' }
        : {
            kind: 'mutation',
            mutation: {
              type: 'setExerciseWeight',
              exerciseId: `exercise-${n}`,
              weight: 100 + n,
            },
          },
  };
}

function createAutobase(store, bootstrapKey) {
  return new Autobase(store, bootstrapKey, {
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
}

class LocalPeer {
  constructor({
    name,
    deviceId,
    storageRoot,
    bootstrapKey,
    replicator,
    verbose,
  }) {
    this.name = name;
    this.deviceId = deviceId;
    this.storageRoot = storageRoot;
    this.bootstrapKey = bootstrapKey;
    this.replicator = replicator;
    this.verbose = verbose;
    this.store = null;
    this.base = null;
    this.swarm = null;
    this.discovery = null;
    this.sentViewLength = 0;
    this.sentRemoteOpIds = new Set();
    this.remoteOps = [];
    this.connections = 0;
  }

  async open() {
    await mkdir(this.storageRoot, { recursive: true });
    this.store = new Corestore(this.storageRoot);
    await this.store.ready();
    this.base = createAutobase(this.store, this.bootstrapKey);
    await this.base.ready();

    this.base.on('update', () => {
      void this.flushRemoteOps();
    });
    this.base.on('writers', () => {
      this.debug('writers changed');
      void this.flushRemoteOps();
    });
    await this.flushRemoteOps();
  }

  get autobaseKeyHex() {
    return b4a.toString(this.base.key, 'hex');
  }

  replicate(socketOrInitiator, opts) {
    const stream =
      this.replicator === 'base'
        ? this.base.replicate(socketOrInitiator, opts)
        : this.store.replicate(socketOrInitiator, opts);

    stream.on?.('remote-core', (core, peerKey) => {
      if (!core?.writable && peerKey) {
        this.base.ackWriter(peerKey).catch((error) => {
          this.debug(`ack writer failed: ${getErrorMessage(error)}`);
        });
      }
    });

    stream.once?.('close', () => {
      this.connections = Math.max(0, this.connections - 1);
      this.debug(`connection closed (${this.connections})`);
    });
    this.connections += 1;
    this.debug(`connection opened (${this.connections})`);
    return stream;
  }

  async append(op) {
    await this.base.append(op, { optimistic: true });
    await this.flushRemoteOps();
  }

  async flushRemoteOps() {
    if (!this.base?.view) return;
    await this.base.update();
    for (let i = 0; i < this.base.view.length; i += 1) {
      const op = await this.base.view.get(i);
      if (op?.deviceId && op.deviceId === this.deviceId) continue;
      const opKey =
        typeof op?.opId === 'string' ? op.opId : `${i}:${JSON.stringify(op)}`;
      if (this.sentRemoteOpIds.has(opKey)) continue;
      this.sentRemoteOpIds.add(opKey);
      this.remoteOps.push(op);
      this.debug(`remote op ${op?.opId ?? '<unknown>'}`);
    }
    this.sentViewLength = Math.max(this.sentViewLength, this.base.view.length);
  }

  hasViewOp(opId) {
    return this.findViewOp(opId).then(Boolean);
  }

  async findViewOp(opId) {
    await this.base.update();
    for (let i = 0; i < this.base.view.length; i += 1) {
      const op = await this.base.view.get(i);
      if (op?.opId === opId) return op;
    }
    return null;
  }

  hasRemoteOp(opId) {
    return this.remoteOps.some((op) => op?.opId === opId);
  }

  async close() {
    if (this.discovery) {
      await this.discovery.destroy().catch(() => {});
      this.discovery = null;
    }
    if (this.swarm) {
      await this.swarm.destroy().catch(() => {});
      this.swarm = null;
    }
    if (this.base) {
      await this.base.close().catch(() => {});
      this.base = null;
    }
    if (this.store) {
      await this.store.close().catch(() => {});
      this.store = null;
    }
  }

  debug(message) {
    if (!this.verbose) return;
    log(`${this.name}: ${message}`);
  }
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

function connectDirect(left, right) {
  const a = left.replicate(true);
  const b = right.replicate(false);
  a.pipe(b).pipe(a);
  return async () => {
    a.destroy();
    b.destroy();
    await waitFor(() => left.connections === 0 && right.connections === 0, {
      timeoutMs: 5000,
      label: 'direct streams to close',
    }).catch(() => {});
  };
}

async function connectSwarm(left, right, topic, timeoutMs) {
  await Promise.allSettled([joinSwarm(left, topic), joinSwarm(right, topic)]);
  await waitFor(() => left.connections > 0 && right.connections > 0, {
    timeoutMs,
    label: 'swarm peers to connect',
  });

  return async () => {
    await left.swarm.destroy().catch(() => {});
    await right.swarm.destroy().catch(() => {});
    left.swarm = null;
    right.swarm = null;
  };
}

async function joinSwarm(peer, topic) {
  if (!peer.swarm) {
    peer.swarm = new Hyperswarm();
    peer.swarm.on('connection', (socket) => peer.replicate(socket));
  }
  if (!peer.discovery) {
    peer.discovery = peer.swarm.join(topic, { server: true, client: true });
  }
  await peer.discovery.flushed();
}

async function waitFor(predicate, { timeoutMs, label }) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const suffix = lastError ? ` Last error: ${getErrorMessage(lastError)}` : '';
  throw new Error(`Timed out waiting for ${label}.${suffix}`);
}

async function waitForRemoteOp(peer, opId, timeoutMs) {
  await waitFor(
    async () => {
      await peer.flushRemoteOps();
      return peer.hasRemoteOp(opId);
    },
    { timeoutMs, label: `${peer.name} to flush remote op ${opId}` },
  );
}

async function waitForViewOp(peer, opId, timeoutMs) {
  await waitFor(() => peer.hasViewOp(opId), {
    timeoutMs,
    label: `${peer.name} view to contain ${opId}`,
  });
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));
  const storageRoot =
    opts.storage ?? (await mkdtemp(join(tmpdir(), 'pearlift-sync-local-')));

  log('starting', {
    transport: opts.transport,
    replicator: opts.replicator,
    storageRoot,
  });

  const aStorage = join(storageRoot, 'device-a');
  const bStorage = join(storageRoot, 'device-b');
  const a = new LocalPeer({
    name: 'Device A',
    deviceId: 'local-device-a',
    storageRoot: aStorage,
    bootstrapKey: null,
    replicator: opts.replicator,
    verbose: opts.verbose,
  });

  let cleanupConnection = async () => {};
  let b = null;
  let aRestarted = null;

  try {
    await a.open();
    const bootstrapKey = a.base.key;
    const bootstrapKeyHex = a.autobaseKeyHex;

    b = new LocalPeer({
      name: 'Device B',
      deviceId: 'local-device-b',
      storageRoot: bStorage,
      bootstrapKey,
      replicator: opts.replicator,
      verbose: opts.verbose,
    });
    await b.open();

    cleanupConnection =
      opts.transport === 'swarm'
        ? await connectSwarm(a, b, LOCAL_SWARM_TOPIC, opts.timeoutMs)
        : connectDirect(a, b);

    log('connected two peers', { autobaseKey: bootstrapKeyHex });

    const aOp1 = makeOp(a.deviceId, 1);
    await a.append(aOp1);
    await waitForRemoteOp(b, aOp1.opId, opts.timeoutMs);
    log('A -> B mutation replicated', { opId: aOp1.opId });

    if (
      opts.transport === 'direct' &&
      (a.connections === 0 || b.connections === 0)
    ) {
      await cleanupConnection();
      cleanupConnection = connectDirect(a, b);
    }

    const bOp1 = makeOp(b.deviceId, 1);
    await b.append(bOp1);
    if (opts.transport === 'direct') {
      const previousCleanup = cleanupConnection;
      const nextCleanup = connectDirect(a, b);
      cleanupConnection = async () => {
        await nextCleanup();
        await previousCleanup();
      };
    }
    await waitForRemoteOp(a, bOp1.opId, opts.timeoutMs);
    log('B -> A mutation replicated', { opId: bOp1.opId });

    if (opts.transport === 'direct') {
      await cleanupConnection();
      cleanupConnection = async () => {};
    }
    await a.close();
    log('Device A stopped');

    const bOp2 = makeOp(b.deviceId, 2);
    await b.append(bOp2);
    log('B appended while A was offline', { opId: bOp2.opId });

    aRestarted = new LocalPeer({
      name: 'Device A restarted',
      deviceId: 'local-device-a',
      storageRoot: aStorage,
      bootstrapKey,
      replicator: opts.replicator,
      verbose: opts.verbose,
    });
    await aRestarted.open();

    cleanupConnection =
      opts.transport === 'swarm'
        ? await connectSwarm(aRestarted, b, LOCAL_SWARM_TOPIC, opts.timeoutMs)
        : connectDirect(aRestarted, b);

    await waitForViewOp(aRestarted, bOp2.opId, opts.timeoutMs);
    log('A reconnected and caught up', { opId: bOp2.opId });

    const aOp2 = makeOp(aRestarted.deviceId, 2);
    await aRestarted.append(aOp2);
    if (opts.transport === 'direct') {
      const previousCleanup = cleanupConnection;
      const nextCleanup = connectDirect(aRestarted, b);
      cleanupConnection = async () => {
        await nextCleanup();
        await previousCleanup();
      };
    }
    await waitForRemoteOp(b, aOp2.opId, opts.timeoutMs);
    log('A restarted -> B mutation replicated', { opId: aOp2.opId });

    log('PASS', {
      aViewLength: aRestarted.base.view.length,
      bViewLength: b.base.view.length,
      bRemoteOps: b.remoteOps.map((op) => op?.opId),
      aRemoteOps: aRestarted.remoteOps.map((op) => op?.opId),
    });
  } finally {
    await cleanupConnection().catch(() => {});
    await aRestarted?.close().catch(() => {});
    await b?.close().catch(() => {});
    await a.close().catch(() => {});
    if (!opts.keep && !opts.storage) {
      await rm(storageRoot, { recursive: true, force: true });
    } else {
      log('kept storage', { storageRoot });
    }
  }
}

run().catch((error) => {
  console.error(`[sync-local] FAIL: ${getErrorMessage(error)}`);
  if (error?.stack) console.error(error.stack);
  process.exitCode = 1;
});
