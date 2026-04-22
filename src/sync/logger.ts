import { getErrorMessage } from '../utils/errors';

export type SyncLogLevel = 'info' | 'warn' | 'error';

type SyncLogDetails = Record<string, unknown> | undefined;

export interface SyncLogEntry {
  ts: number;
  level: SyncLogLevel;
  scope: string;
  key: string;
  message: string;
  data?: Record<string, unknown>;
}

const MAX_LOG_ENTRIES = 200;
const logRing: SyncLogEntry[] = [];

function appendToRing(entry: SyncLogEntry) {
  logRing.push(entry);
  if (logRing.length > MAX_LOG_ENTRIES) {
    logRing.splice(0, logRing.length - MAX_LOG_ENTRIES);
  }
}

function logWithLevel(
  level: SyncLogLevel,
  prefix: string,
  message: string,
  details?: SyncLogDetails,
) {
  const payload = details && Object.keys(details).length > 0 ? details : null;

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

export function logSyncEvent(
  level: SyncLogLevel,
  scope: string,
  event: string,
  message: string,
  details?: SyncLogDetails,
) {
  logWithLevel(level, `[pearlift-sync/${scope}:${event}]`, message, details);
  appendToRing({
    ts: Date.now(),
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
) {
  const message = getErrorMessage(error);
  logWithLevel('error', `[pearlift-sync/${scope}:${event}]`, message, details);
  appendToRing({
    ts: Date.now(),
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

export function combineLogs(
  a: SyncLogEntry[],
  b: SyncLogEntry[],
  cap = 400,
): SyncLogEntry[] {
  const merged = [...a, ...b];
  merged.sort((x, y) => y.ts - x.ts);
  return merged.slice(0, cap);
}
