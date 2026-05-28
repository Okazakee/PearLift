import type {
  SyncFirstSyncResolution,
  SyncRole,
  SyncRoomBindingState,
} from '@/storage/types';

export type SyncDeviceRow = {
  device_id: string;
  device_code: string;
  display_name: string;
  writer_key: string | null;
  last_seen: string;
  is_hidden: number;
};

export type SyncIdentityDbRow = {
  sync_enabled: number;
  device_id: string | null;
  pairing_secret_ciphertext: string | null;
  pairing_secret_iv: string | null;
  pairing_secret_tag: string | null;
  lamport_counter: number;
  last_error: string | null;
  last_synced_at: string | null;
  updated_at: string;
};

export type SyncRoomStateDbRow = {
  room_id: string;
  sync_role: SyncRole | null;
  room_binding_state: SyncRoomBindingState | null;
  first_sync_resolution: SyncFirstSyncResolution | null;
  autobase_bootstrap_key: string | null;
  pending_local_summary: string | null;
  pending_remote_summary: string | null;
  pending_conflict_summary: string | null;
};

export type SyncOutboxRow = {
  id: number;
  payload_json: string;
};

export type SyncProfileOutboxRow = {
  id: number;
  display_name: string;
};

export function parseJsonColumn<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function isNewerRevision(
  incomingRevision: string | null | undefined,
  currentRevision: string | null | undefined,
): boolean {
  if (!incomingRevision || !currentRevision) return true;
  const incomingTime = Date.parse(incomingRevision);
  const currentTime = Date.parse(currentRevision);
  if (!Number.isFinite(incomingTime) || !Number.isFinite(currentTime)) {
    return incomingRevision > currentRevision;
  }
  return incomingTime > currentTime;
}
