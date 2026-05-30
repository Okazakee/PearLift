import b4a from 'b4a';
import cenc from 'compact-encoding';
import {
  RPC_SYNC_GET_LOGS,
  RPC_SYNC_LOG_EVENT,
  RPC_SYNC_PUBLISH,
  RPC_SYNC_REMOTE_OP_EVENT,
  RPC_SYNC_START,
  RPC_SYNC_STATUS,
  RPC_SYNC_STATUS_EVENT,
  RPC_SYNC_STOP,
} from '@/sync/rpcCommands';
import type { SyncRole } from '@/storage/types';
import type { SyncHealth, SyncOpEnvelope, SyncStatus } from '@/sync/types';

type Direction = 'request' | 'response' | 'event';

const FRAME_ANY = cenc.frame(cenc.any);

type RuntimeLogMessage = {
  level?: 'error' | 'warn' | 'info' | 'debug';
  deviceTag?: string;
  scope?: string;
  event?: string;
  message?: string;
  details?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function isSyncStatus(value: unknown): value is SyncStatus {
  return (
    value === 'idle' ||
    value === 'connecting' ||
    value === 'waiting' ||
    value === 'dht_ready' ||
    value === 'peer_connected' ||
    value === 'handshake_ok' ||
    value === 'replicating' ||
    value === 'synced' ||
    value === 'error'
  );
}

function decodeLegacyJsonBytes(bytes: Uint8Array): unknown {
  const txt = b4a.toString(bytes);
  return JSON.parse(txt) as unknown;
}

function decodeFramePayload(payload: Uint8Array | string | null | undefined) {
  if (!payload) return null;

  if (typeof payload === 'string') {
    return JSON.parse(payload) as unknown;
  }

  if (payload.byteLength > 0 && (payload[0] === 123 || payload[0] === 91)) {
    try {
      return decodeLegacyJsonBytes(payload);
    } catch {
      // not legacy JSON, continue
    }
  }

  try {
    return cenc.decode(FRAME_ANY, payload) as unknown;
  } catch {
    return decodeLegacyJsonBytes(payload);
  }
}

function encodeFramePayload(value: unknown): Uint8Array {
  return cenc.encode(FRAME_ANY, value) as Uint8Array;
}

function assertStartRequest(value: unknown): {
  pairingSecretHex: string;
  deviceId: string;
  role: SyncRole;
  bootstrapKeyHex?: string | null;
  storagePath?: string;
  dhtBootstrap?: { host: string; port: number } | null;
  debug?: {
    discoveryOnly?: boolean;
    disableCursorOptimization?: boolean;
  };
} {
  if (!isRecord(value)) {
    throw new Error('SYNC_START request must be an object.');
  }
  if (typeof value.pairingSecretHex !== 'string') {
    throw new Error('SYNC_START pairingSecretHex must be a string.');
  }
  if (typeof value.deviceId !== 'string') {
    throw new Error('SYNC_START deviceId must be a string.');
  }
  if (value.role !== 'creator' && value.role !== 'joiner') {
    throw new Error('SYNC_START role must be creator or joiner.');
  }
  if (
    value.bootstrapKeyHex != null &&
    typeof value.bootstrapKeyHex !== 'string'
  ) {
    throw new Error('SYNC_START bootstrapKeyHex must be string or null.');
  }
  if (value.storagePath != null && typeof value.storagePath !== 'string') {
    throw new Error('SYNC_START storagePath must be a string.');
  }
  if (value.debug != null && !isRecord(value.debug)) {
    throw new Error('SYNC_START debug must be an object when provided.');
  }
  if (
    isRecord(value.debug) &&
    value.debug.discoveryOnly != null &&
    typeof value.debug.discoveryOnly !== 'boolean'
  ) {
    throw new Error('SYNC_START debug.discoveryOnly must be boolean.');
  }
  if (
    isRecord(value.debug) &&
    value.debug.disableCursorOptimization != null &&
    typeof value.debug.disableCursorOptimization !== 'boolean'
  ) {
    throw new Error(
      'SYNC_START debug.disableCursorOptimization must be boolean.',
    );
  }
  let dhtBootstrap: { host: string; port: number } | null = null;
  if (value.dhtBootstrap != null) {
    if (!isRecord(value.dhtBootstrap)) {
      throw new Error('SYNC_START dhtBootstrap must be an object.');
    }
    if (typeof value.dhtBootstrap.host !== 'string') {
      throw new Error('SYNC_START dhtBootstrap.host must be a string.');
    }
    if (typeof value.dhtBootstrap.port !== 'number') {
      throw new Error('SYNC_START dhtBootstrap.port must be a number.');
    }
    dhtBootstrap = {
      host: value.dhtBootstrap.host,
      port: value.dhtBootstrap.port,
    };
  }
  return {
    pairingSecretHex: value.pairingSecretHex,
    deviceId: value.deviceId,
    role: value.role as SyncRole,
    bootstrapKeyHex:
      typeof value.bootstrapKeyHex === 'string' ? value.bootstrapKeyHex : null,
    storagePath:
      typeof value.storagePath === 'string' ? value.storagePath : undefined,
    debug: isRecord(value.debug)
      ? {
          discoveryOnly:
            typeof value.debug.discoveryOnly === 'boolean'
              ? value.debug.discoveryOnly
              : undefined,
          disableCursorOptimization:
            typeof value.debug.disableCursorOptimization === 'boolean'
              ? value.debug.disableCursorOptimization
              : undefined,
        }
      : undefined,
    dhtBootstrap,
  };
}

function normalizeAck(value: unknown) {
  if (!isRecord(value)) {
    return { ok: false, error: 'Malformed response payload.' as string };
  }
  return {
    ok: typeof value.ok === 'boolean' ? value.ok : undefined,
    error: toStringOrNull(value.error) ?? undefined,
  };
}

function normalizeStartResponse(value: unknown) {
  const ack = normalizeAck(value);
  const record = isRecord(value) ? value : {};
  return {
    ...ack,
    bootstrapKeyHex: toStringOrNull(record.bootstrapKeyHex) ?? undefined,
  };
}

function normalizeHealth(value: unknown): Partial<SyncHealth> {
  if (!isRecord(value)) {
    throw new Error('SYNC_STATUS payload must be an object.');
  }

  const status = isSyncStatus(value.status) ? value.status : undefined;
  const peers =
    typeof value.peers === 'number' && Number.isFinite(value.peers)
      ? Math.max(0, Math.floor(value.peers))
      : undefined;
  const connections =
    typeof value.connections === 'number' && Number.isFinite(value.connections)
      ? Math.max(0, Math.floor(value.connections))
      : undefined;
  const reconnectAttempts =
    typeof value.reconnectAttempts === 'number' &&
    Number.isFinite(value.reconnectAttempts)
      ? Math.max(0, Math.floor(value.reconnectAttempts))
      : undefined;
  const bootstrapped =
    typeof value.bootstrapped === 'boolean' ? value.bootstrapped : undefined;

  const localWriterKey = toStringOrNull(value.localWriterKey);
  const localPublicKey = toStringOrNull(value.localPublicKey);

  return {
    status,
    syncMode:
      value.syncMode === 'degraded' || value.syncMode === 'normal'
        ? value.syncMode
        : undefined,
    degradedReason: toStringOrNull(value.degradedReason),
    degradedSince:
      typeof value.degradedSince === 'number' &&
      Number.isFinite(value.degradedSince)
        ? value.degradedSince
        : null,
    peers,
    connections,
    peerKeys: toStringArray(value.peerKeys),
    localWriterKey: localWriterKey ?? localPublicKey,
    // Compatibility alias for existing UI bindings.
    localPublicKey: localPublicKey ?? localWriterKey,
    autobaseKey: toStringOrNull(value.autobaseKey),
    topicHex: toStringOrNull(value.topicHex),
    bootstrapped,
    reconnectAttempts,
    lastSyncedAt: toStringOrNull(value.lastSyncedAt),
    lastError: toStringOrNull(value.lastError),
  };
}

function normalizeLogEntries(value: unknown) {
  if (!isRecord(value)) {
    return { entries: [] as Array<Record<string, unknown>> };
  }
  const entries = Array.isArray(value.entries)
    ? value.entries.filter(isRecord)
    : [];
  return { entries };
}

function normalizeRuntimeLogMessage(value: unknown): RuntimeLogMessage {
  if (!isRecord(value)) {
    throw new Error('SYNC_LOG event payload must be an object.');
  }
  return {
    level:
      value.level === 'error' ||
      value.level === 'warn' ||
      value.level === 'info' ||
      value.level === 'debug'
        ? value.level
        : undefined,
    deviceTag: toStringOrNull(value.deviceTag) ?? undefined,
    scope: toStringOrNull(value.scope) ?? undefined,
    event: toStringOrNull(value.event) ?? undefined,
    message: toStringOrNull(value.message) ?? undefined,
    details: isRecord(value.details) ? value.details : undefined,
  };
}

function normalizeSyncOp(value: unknown): SyncOpEnvelope {
  if (!isRecord(value)) {
    throw new Error('SYNC op payload must be an object.');
  }
  if (typeof value.opId !== 'string') {
    throw new Error('SYNC op must include string opId.');
  }
  if (typeof value.deviceId !== 'string') {
    throw new Error('SYNC op must include string deviceId.');
  }
  if (typeof value.createdAt !== 'string') {
    throw new Error('SYNC op must include string createdAt.');
  }
  if (typeof value.schemaVersion !== 'number') {
    throw new Error('SYNC op must include numeric schemaVersion.');
  }
  if (value.schemaVersion !== 1) {
    throw new Error('SYNC op schemaVersion must be 1.');
  }
  if (
    typeof value.lamport !== 'number' ||
    !Number.isFinite(value.lamport) ||
    value.lamport < 0
  ) {
    throw new Error('SYNC op must include non-negative numeric lamport.');
  }
  return {
    schemaVersion: 1,
    opId: value.opId,
    deviceId: value.deviceId,
    lamport: value.lamport,
    createdAt: value.createdAt,
    payload: value.payload as SyncOpEnvelope['payload'],
    mutation: value.mutation as SyncOpEnvelope['mutation'],
  };
}

function normalizeForCommand(
  command: number,
  direction: Direction,
  value: unknown,
): unknown {
  if (direction === 'request') {
    if (command === RPC_SYNC_START) return assertStartRequest(value);
    if (command === RPC_SYNC_STOP) {
      if (!isRecord(value) || typeof value.stop !== 'boolean') {
        throw new Error('SYNC_STOP request must contain boolean stop.');
      }
      return { stop: value.stop };
    }
    if (command === RPC_SYNC_STATUS) {
      if (!isRecord(value) || typeof value.now !== 'number') {
        throw new Error('SYNC_STATUS request must contain numeric now.');
      }
      return { now: value.now };
    }
    if (command === RPC_SYNC_PUBLISH) return normalizeSyncOp(value);
    if (command === RPC_SYNC_GET_LOGS) {
      return isRecord(value) ? value : {};
    }
    return value;
  }

  if (direction === 'response') {
    if (command === RPC_SYNC_START) return normalizeStartResponse(value);
    if (
      command === RPC_SYNC_STOP ||
      command === RPC_SYNC_PUBLISH ||
      command === RPC_SYNC_GET_LOGS
    ) {
      if (command === RPC_SYNC_GET_LOGS) return normalizeLogEntries(value);
      return normalizeAck(value);
    }
    if (command === RPC_SYNC_STATUS) return normalizeHealth(value);
    return value;
  }

  if (command === RPC_SYNC_REMOTE_OP_EVENT) return normalizeSyncOp(value);
  if (command === RPC_SYNC_STATUS_EVENT) return normalizeHealth(value);
  if (command === RPC_SYNC_LOG_EVENT) return normalizeRuntimeLogMessage(value);
  return value;
}

export function encodeRpcPayload(
  command: number,
  direction: Direction,
  payload: unknown,
): Uint8Array {
  const normalized = normalizeForCommand(command, direction, payload);
  return encodeFramePayload(normalized);
}

export function decodeRpcPayload(
  command: number,
  direction: Direction,
  payload: Uint8Array | string | null | undefined,
): unknown {
  const decoded = decodeFramePayload(payload);
  return normalizeForCommand(command, direction, decoded);
}
