import { HolepunchWorkletBridge } from '@/sync/holepunchBridge';
import type { SyncBridge } from '@/sync/types';

export function createSyncBridge(override?: SyncBridge): SyncBridge {
  if (override) {
    return override;
  }

  return new HolepunchWorkletBridge();
}
