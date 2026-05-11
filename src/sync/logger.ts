import { getErrorMessage } from '@/utils/errors';

export type SyncLogLevel = 'info' | 'warn' | 'error';

type SyncLogDetails = Record<string, unknown> | undefined;

export interface SyncLogEntry {
  ts: number;
  deviceTag: string;
  level: SyncLogLevel;
  scope: string;
  key: string;
  message: string;
  data?: Record<string, unknown>;
}

const MAX_LOG_ENTRIES = 100;
const logRing: SyncLogEntry[] = [];
let diagnosticsSink: ((entry: SyncLogEntry) => void) | null = null;
let currentDeviceTag = createRuntimeDeviceTag();

function createRuntimeDeviceTag() {
  return `run-${Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, '0')}`;
}

function appendToRing(entry: SyncLogEntry) {
  logRing.push(entry);
  if (logRing.length > MAX_LOG_ENTRIES) {
    logRing.splice(0, logRing.length - MAX_LOG_ENTRIES);
  }
  emitDiagnostics(entry);
}

function emitDiagnostics(entry: SyncLogEntry) {
  try {
    diagnosticsSink?.(entry);
  } catch {
    // ignore diagnostics sink failures
  }

  try {
    const hook = (globalThis as Record<string, unknown>)
      .__PEARLIFT_SYNC_DIAGNOSTICS__;
    if (Array.isArray(hook)) {
      hook.push(entry);
    }
  } catch {
    // ignore diagnostics hook failures
  }

  try {
    const inspect = (globalThis as Record<string, unknown>).PearInspect as
      | { emit?: (topic: string, payload: unknown) => void }
      | undefined;
    inspect?.emit?.('pearlift-sync-log', entry);
  } catch {
    // ignore pear-inspect integration errors
  }

  if (entry.level !== 'error') {
    return;
  }

  try {
    const errorHook = (globalThis as Record<string, unknown>)
      .__PEARLIFT_SYNC_ERROR_HOOK__ as
      | ((payload: SyncLogEntry) => void)
      | undefined;
    errorHook?.(entry);
  } catch {
    // ignore crash hook failures
  }
}

function logWithLevel(
  level: SyncLogLevel,
  prefix: string,
  message: string,
  details?: SyncLogDetails,
) {
  const payload = details && Object.keys(details).length > 0 ? details : null;

  if (__DEV__) {
    if (level === 'warn') {
      // eslint-disable-next-line no-console
      console.warn(prefix, message, ...(payload ? [payload] : []));
      return;
    }

    if (level === 'error') {
      // eslint-disable-next-line no-console
      console.error(prefix, message, ...(payload ? [payload] : []));
      return;
    }

    // eslint-disable-next-line no-console
    console.log(prefix, message, ...(payload ? [payload] : []));
  }
}

export function logSyncEvent(
  level: SyncLogLevel,
  scope: string,
  event: string,
  message: string,
  details?: SyncLogDetails,
  deviceTagOverride?: string,
) {
  const deviceTag = deviceTagOverride ?? currentDeviceTag;
  logWithLevel(
    level,
    `[pearlift-sync][dev:${deviceTag}][${scope}:${event}]`,
    message,
    details,
  );
  appendToRing({
    ts: Date.now(),
    deviceTag,
    level,
    scope,
    key: event,
    message,
    data: details,
  });
}

export function logSyncError(
  scope: string,
  event: string,
  error: unknown,
  details?: SyncLogDetails,
  deviceTagOverride?: string,
) {
  const message = getErrorMessage(error);
  const deviceTag = deviceTagOverride ?? currentDeviceTag;
  logWithLevel(
    'error',
    `[pearlift-sync][dev:${deviceTag}][${scope}:${event}]`,
    message,
    details,
  );
  appendToRing({
    ts: Date.now(),
    deviceTag,
    level: 'error',
    scope,
    key: event,
    message,
    data: details,
  });
}

export function getRecentLogs(): SyncLogEntry[] {
  return logRing.slice();
}

export function clearRecentLogs() {
  logRing.length = 0;
}

export function setSyncDiagnosticsSink(
  sink: ((entry: SyncLogEntry) => void) | null,
) {
  diagnosticsSink = sink;
}

export function setSyncLogDeviceTag(tag: string) {
  const normalized = tag.trim();
  if (!normalized) return;
  currentDeviceTag = normalized;
}

export function getSyncLogDeviceTag() {
  return currentDeviceTag;
}

export function resetSyncLogDeviceTagToRuntime() {
  currentDeviceTag = createRuntimeDeviceTag();
}

export function combineLogs(
  a: SyncLogEntry[],
  b: SyncLogEntry[],
  cap = 100,
): SyncLogEntry[] {
  const merged = [...a, ...b];
  merged.sort((x, y) => y.ts - x.ts);
  return merged.slice(0, cap);
}
