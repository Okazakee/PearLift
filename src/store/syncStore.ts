import { create } from 'zustand';
import type { PairedDevice, SyncStateRow } from '@/storage/types';
import type { SyncLogEntry } from '@/sync/logger';
import { INITIAL_SYNC_HEALTH, type SyncHealth } from '@/sync/types';

interface SyncState {
  syncState: SyncStateRow | null;
  syncHealth: SyncHealth;
  pairedDevices: PairedDevice[];
  localDeviceDisplayName: string;
  syncLogs: SyncLogEntry[];
  setSyncStateRow: (syncState: SyncStateRow | null) => void;
  setSyncHealth: (syncHealth: SyncHealth) => void;
  setPairedDevices: (pairedDevices: PairedDevice[]) => void;
  setLocalDeviceDisplayName: (name: string) => void;
  setSyncLogs: (syncLogs: SyncLogEntry[]) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  syncState: null,
  syncHealth: { ...INITIAL_SYNC_HEALTH },
  pairedDevices: [],
  localDeviceDisplayName: '',
  syncLogs: [],
  setSyncStateRow: (syncState) => set({ syncState }),
  setSyncHealth: (syncHealth) => set({ syncHealth }),
  setPairedDevices: (pairedDevices) => set({ pairedDevices }),
  setLocalDeviceDisplayName: (localDeviceDisplayName) =>
    set({ localDeviceDisplayName }),
  setSyncLogs: (syncLogs) => set({ syncLogs }),
}));
