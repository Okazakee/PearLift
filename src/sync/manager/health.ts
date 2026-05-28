import type { SyncHealth } from '@/sync/types';

export function buildHealthSignature(next: SyncHealth): string {
  return [
    next.status,
    next.syncMode,
    next.degradedReason ?? '',
    next.degradedSince ?? '',
    next.peers,
    next.connections,
    next.bootstrapped ? '1' : '0',
    next.reconnectAttempts,
    next.lastError ?? '',
  ].join('|');
}

