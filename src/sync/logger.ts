import { getErrorMessage } from '../utils/errors';

export type SyncLogLevel = 'info' | 'warn' | 'error';

type SyncLogDetails = Record<string, unknown> | undefined;

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
}

export function logSyncError(
  scope: string,
  event: string,
  error: unknown,
  details?: SyncLogDetails,
) {
  logWithLevel(
    'error',
    `[pearlift-sync/${scope}:${event}]`,
    getErrorMessage(error),
    details,
  );
}
