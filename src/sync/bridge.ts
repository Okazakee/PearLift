import { HolepunchWorkletBridge } from './holepunchBridge';
import type { SyncBridge } from './types';

export function createSyncBridge(override?: SyncBridge): SyncBridge {
  if (override) {
    return override;
  }

  return new HolepunchWorkletBridge();
}
