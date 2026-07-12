import type {
  BackupProgramCollection,
  PearLiftRuntimeState,
} from '@/backup/types';
import type {
  MutationContext,
  PairedDevice,
  SyncStateRow,
  WorkoutMutation,
  WorkoutStoreSnapshot,
} from '@/storage/types';
import type { SyncDeviceProfile, SyncMutation } from '@/sync/types';
import type {
  ProgramSummary,
  UserExerciseSettings,
  WorkoutSessionLog,
} from '@/types';

export interface WorkoutRepositoryPort {
  initialize(): Promise<void>;
  getSnapshot(): Promise<WorkoutStoreSnapshot>;
  isSetupDone(): Promise<boolean>;
  markSetupDone(): Promise<void>;
  getRuntimeState(): Promise<PearLiftRuntimeState>;
  getBackupProgramCollection(): Promise<BackupProgramCollection>;
  getAvailablePrograms(): Promise<ProgramSummary[]>;
  setActiveProgram(programId: string): Promise<void>;
  importProgram(input: {
    runtime: PearLiftRuntimeState;
    sessionLogs: WorkoutSessionLog[];
    mode: 'import_as_new' | 'replace_active';
    activate?: boolean;
  }): Promise<void>;
  saveWorkoutSessionLog(log: WorkoutSessionLog): Promise<void>;
  saveUserExerciseSettings(settings: UserExerciseSettings): Promise<void>;
  getWorkoutSessionLogs(input?: {
    workoutId?: string;
    limit?: number | null;
  }): Promise<WorkoutSessionLog[]>;
  applyMutation(
    mutation: WorkoutMutation,
    ctx?: MutationContext,
  ): Promise<void>;
  getSyncState(): Promise<SyncStateRow>;
  setSyncState(patch: Partial<SyncStateRow>): Promise<void>;
  nextLamport(): Promise<number>;
  hasAppliedSyncOp(opId: string): Promise<boolean>;
  markSyncOpApplied(meta: {
    opId: string;
    deviceId: string;
    lamport: number;
    displayName?: string | null;
    writerKey?: string | null;
  }): Promise<void>;
  getPairedDevices(): Promise<PairedDevice[]>;
  forgetDevice(deviceId: string): Promise<void>;
  getLocalDeviceDisplayName(): Promise<string>;
  setLocalDeviceDisplayName(displayName: string): Promise<void>;
  setPendingDeviceProfileDisplayName(displayName: string | null): Promise<void>;
  getPendingDeviceProfileDisplayName(): Promise<string | null>;
  clearPendingDeviceProfileDisplayName(): Promise<void>;
  queuePendingLocalSyncMutation(mutation: SyncMutation): Promise<void>;
  getPendingLocalSyncMutations(): Promise<SyncMutation[]>;
  clearPendingLocalSyncMutations(): Promise<void>;
  replaceSyncProjection(input: {
    runtime: PearLiftRuntimeState;
    devices: Array<SyncDeviceProfile & { lastSeen: string }>;
    appliedOps: Array<{
      opId: string;
      deviceId: string;
      lamport: number;
    }>;
  }): Promise<void>;
  pruneAppliedSyncOps(limit?: number): Promise<void>;
  clearSyncPeerHistory(): Promise<void>;
  leaveSyncRoom(): Promise<void>;
  getOrCreateDeviceId(): Promise<string>;
  upsertSyncedDevice(
    profile: SyncDeviceProfile & { lastSeen?: string | null },
  ): Promise<void>;
}
