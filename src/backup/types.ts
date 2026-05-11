import type { ThemePreference } from '@/theme/tokens';
import type {
  DayConfig,
  Exercise,
  UserWeights,
  WeekConfig,
  WeightUnit,
  WorkoutDay,
  WorkoutSession,
} from '@/types';

export interface PearLiftBackupExercise
  extends Omit<Exercise, 'notes' | 'position'> {
  notes?: string;
  position?: number;
}

export interface PearLiftBackupWorkout
  extends Omit<WorkoutSession, 'exercises'> {
  exercises: PearLiftBackupExercise[];
}

export interface PearLiftBackupV3 {
  version: number;
  exportedAt: string;
  data: {
    workouts: PearLiftBackupWorkout[];
    userWeights: UserWeights;
    weekConfigs?: WeekConfig[];
    dayConfigs?: DayConfig[];
    settings: {
      currentWeek: number;
      currentDay?: WorkoutDay;
      restDuration: number;
      themeMode: ThemePreference;
      weightUnit: WeightUnit;
      language: string;
    };
  };
}

export type PearLiftBackupAny = Record<string, unknown>;

export interface PearLiftRuntimeState {
  workouts: WorkoutSession[];
  userWeights: UserWeights;
  weekConfigs: WeekConfig[];
  dayConfigs: DayConfig[];
  currentWeek: number;
  currentDay: WorkoutDay;
  restDuration: number;
  themeMode: ThemePreference;
  weightUnit: WeightUnit;
  language: string;
}

export interface MigratedBackupResult {
  backup: PearLiftBackupV3;
  runtime: PearLiftRuntimeState;
}

export interface WorkoutChange {
  workoutId: string;
  name: string;
  added: number;
  removed: number;
  modified: number;
}

export interface SettingChange {
  key: string;
  from: string;
  to: string;
}

export interface ChangeSummary {
  workouts: WorkoutChange[];
  settings: SettingChange[];
  weekConfigs: SettingChange[];
  dayConfigs: SettingChange[];
  totalChanges: number;
}
