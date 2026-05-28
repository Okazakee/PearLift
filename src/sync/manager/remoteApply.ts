import { getOpPayload } from '@/sync/conflicts';
import type { SyncHealth, SyncOpEnvelope } from '@/sync/types';

export function shouldBufferDuringJoin(
  op: SyncOpEnvelope,
  currentRole: 'creator' | 'joiner' | null,
  roomBindingState: string,
): boolean {
  const payload = getOpPayload(op);
  return (
    currentRole === 'joiner' &&
    (roomBindingState === 'pending_first_sync' ||
      roomBindingState === 'conflict_requires_decision') &&
    payload.kind !== 'presence'
  );
}

export function shouldBufferDuringActiveConflict(
  op: SyncOpEnvelope,
  roomBindingState: string,
): boolean {
  const payload = getOpPayload(op);
  return (
    roomBindingState === 'active_conflict_requires_decision' &&
    payload.kind !== 'presence' &&
    payload.kind !== 'device_profile'
  );
}

export function shouldTryReconnectConflict(
  op: SyncOpEnvelope,
  roomBindingState: string,
  pendingReconnectLocalMutations: unknown[],
): boolean {
  const payload = getOpPayload(op);
  return (
    roomBindingState === 'active' &&
    pendingReconnectLocalMutations.length > 0 &&
    payload.kind !== 'presence' &&
    payload.kind !== 'device_profile'
  );
}

export function isHealthyReconnectState(health: SyncHealth): boolean {
  return (
    health.status !== 'error' &&
    health.status !== 'waiting' &&
    health.reconnectAttempts <= 0
  );
}

