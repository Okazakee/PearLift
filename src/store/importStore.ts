import { create } from 'zustand';
import type { ChangeSummary, MigratedBackupResult } from '@/backup/types';

const INITIAL_IMPORT_SUMMARY: ChangeSummary = {
  workouts: [],
  settings: [],
  weekConfigs: [],
  dayConfigs: [],
  totalChanges: 0,
};

interface ImportState {
  pendingImport: MigratedBackupResult | null;
  importSummary: ChangeSummary;
  setPendingImport: (pendingImport: MigratedBackupResult | null) => void;
  setImportSummary: (importSummary: ChangeSummary) => void;
  resetImportState: () => void;
}

export const useImportStore = create<ImportState>((set) => ({
  pendingImport: null,
  importSummary: INITIAL_IMPORT_SUMMARY,
  setPendingImport: (pendingImport) => set({ pendingImport }),
  setImportSummary: (importSummary) => set({ importSummary }),
  resetImportState: () =>
    set({
      pendingImport: null,
      importSummary: INITIAL_IMPORT_SUMMARY,
    }),
}));
