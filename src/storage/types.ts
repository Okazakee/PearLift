import type { PearLiftRuntimeState } from '../backup/types';
import type { ThemePreference } from '../theme/tokens';
import type { DayConfig, Exercise, WeekConfig, WorkoutDay } from '../types';

export type SyncMode = 'local-only' | 'd2d-sync';

export type SetupRecoverySource = 'start-fresh' | 'local-import' | null;

export interface AppSetupState {
  hasCompletedOnboarding: boolean;
  syncMode: SyncMode;
  identityProvisionedAt: string | null;
  hasSeenRecoveryOptions: boolean;
  completedAt: string | null;
  recoverySource: SetupRecoverySource;
}

export type SyncEntityType =
  | 'exercise'
  | 'weight'
  | 'week-config'
  | 'day-config'
  | 'setting'
  | 'program'
  | 'app';

export type SyncOperation =
  | 'upsert'
  | 'delete'
  | 'reorder'
  | 'reset'
  | 'restore';

export interface SyncLogEntry {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  updatedAt: string;
  deviceId: string;
  payload: string;
  snapshotVersion: number;
}

export interface SyncCheckpoint {
  localRevision: number;
  lastBackupRevision: number;
  lastBackupAt: string | null;
  lastBackupEventId: string | null;
  lastRestoreAt: string | null;
}

export interface AppSettings {
  currentWeek: number;
  currentDay: WorkoutDay;
  restDuration: number;
  themeMode: ThemePreference;
}

export type WorkoutMutation =
  | { type: 'setThemeMode'; themeMode: ThemePreference }
  | { type: 'setCurrentWeek'; currentWeek: number }
  | { type: 'setCurrentDay'; currentDay: WorkoutDay }
  | { type: 'setRestDuration'; restDuration: number }
  | { type: 'setExerciseWeight'; exerciseId: string; value: number }
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
      type: 'reorderExercise';
      workoutId: WorkoutDay;
      exerciseId: string;
      direction: 'up' | 'down';
    }
  | { type: 'replaceWeekConfigs'; weekConfigs: WeekConfig[] }
  | { type: 'replaceDayConfigs'; dayConfigs: DayConfig[] }
  | { type: 'resetAllData' }
  | {
      type: 'restoreRuntimeState';
      runtime: PearLiftRuntimeState;
      source: 'local-import' | 'migration';
    };

export interface WorkoutStoreSnapshot extends PearLiftRuntimeState {
  isHydrating: boolean;
  checkpoint: SyncCheckpoint;
}
