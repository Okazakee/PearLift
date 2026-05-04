import type { PearLiftRuntimeState } from '../backup/types';
import type { ThemePreference } from '../theme/tokens';
import type {
  DayConfig,
  Exercise,
  WeekConfig,
  WeightUnit,
  WorkoutDay,
} from '../types';

export interface AppSettings {
  currentWeek: number;
  currentDay: WorkoutDay;
  restDuration: number;
  themeMode: ThemePreference;
  weightUnit: WeightUnit;
}

export type WorkoutMutation =
  | { type: 'setThemeMode'; themeMode: ThemePreference }
  | { type: 'setCurrentWeek'; currentWeek: number }
  | { type: 'setCurrentDay'; currentDay: WorkoutDay }
  | { type: 'setRestDuration'; restDuration: number }
  | { type: 'setWeightUnit'; weightUnit: WeightUnit }
  | { type: 'setLanguage'; language: string }
  | { type: 'setExerciseWeight'; exerciseId: string; value: number }
  | { type: 'adjustExerciseWeight'; exerciseId: string; delta: number }
  | {
      type: 'addExercise';
      workoutId: WorkoutDay;
      exercise: Omit<Exercise, 'id' | 'position' | 'baseWeight'>;
    }
  | {
      type: 'editExercise';
      workoutId: WorkoutDay;
      exerciseId: string;
      updates: Partial<Exercise>;
    }
  | { type: 'deleteExercise'; workoutId: WorkoutDay; exerciseId: string }
  | {
      type: 'reorderExercises';
      workoutId: WorkoutDay;
      orderedExerciseIds: string[];
    }
  | { type: 'replaceWeekConfigs'; weekConfigs: WeekConfig[] }
  | { type: 'replaceDayConfigs'; dayConfigs: DayConfig[] }
  | { type: 'resetWorkoutData' }
  | { type: 'resetAllData' }
  | {
      type: 'restoreRuntimeState';
      runtime: PearLiftRuntimeState;
      source: 'local-import' | 'migration';
    };

export type MutationOrigin = 'local' | 'remote';

export type SyncRole = 'creator' | 'joiner';

export type SyncRoomBindingState =
  | 'unconfigured'
  | 'pending_first_sync'
  | 'active'
  | 'conflict_requires_decision';

export type SyncFirstSyncResolution =
  | 'unknown'
  | 'auto_import_remote'
  | 'auto_publish_local'
  | 'auto_merge'
  | 'local_chosen'
  | 'remote_chosen';

export interface SyncDataSummary {
  workoutCount: number;
  workoutIds: string[];
  exerciseCount: number;
  exerciseIds: string[];
  weightEntryCount: number;
  weekConfigIds: number[];
  dayConfigIds: string[];
  settingsFingerprint: string;
}

export interface SyncConflictSummary {
  overlappingWorkoutIds: string[];
  overlappingExerciseIds: string[];
  overlappingWeekConfigIds: number[];
  overlappingDayConfigIds: string[];
  settingsConflict: boolean;
  remoteOpCount: number;
  requiresManualChoice: boolean;
}

export interface MutationContext {
  origin: MutationOrigin;
  opId?: string;
  deviceId?: string;
  lamport?: number;
  suppressSyncEmit?: boolean;
}

export interface SyncStateRow {
  syncEnabled: boolean;
  deviceId: string | null;
  pairingSecretCiphertext: string | null;
  pairingSecretIv: string | null;
  pairingSecretTag: string | null;
  autobaseBootstrapKey: string | null;
  lamportCounter: number;
  syncRole: SyncRole | null;
  roomBindingState: SyncRoomBindingState;
  firstSyncResolution: SyncFirstSyncResolution;
  pendingLocalSummary: SyncDataSummary | null;
  pendingRemoteSummary: SyncDataSummary | null;
  pendingConflictSummary: SyncConflictSummary | null;
  lastError: string | null;
  lastSyncedAt: string | null;
  updatedAt: string;
}

export interface PairedDevice {
  deviceId: string;
  lastSeen: string;
}

export interface WorkoutStoreSnapshot extends PearLiftRuntimeState {
  isHydrating: boolean;
  isSetupDone: boolean;
}
