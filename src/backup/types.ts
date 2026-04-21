import type { ThemePreference } from '../theme/tokens';
import type {
  DayConfig,
  Exercise,
  UserWeights,
  WeekConfig,
  WeightUnit,
  WorkoutDay,
  WorkoutSession,
} from '../types';

export interface PwaBackupExercise
  extends Omit<Exercise, 'notes' | 'position'> {
  notes?: string;
  position?: number;
}

export interface PwaBackupWorkout extends Omit<WorkoutSession, 'exercises'> {
  exercises: PwaBackupExercise[];
}

export interface PwaBackupV2 {
  version: number;
  exportedAt: string;
  data: {
    workouts: PwaBackupWorkout[];
    userWeights: UserWeights;
    weekConfigs?: WeekConfig[];
    dayConfigs?: DayConfig[];
    settings: {
      currentWeek: number;
      currentDay?: WorkoutDay;
      restDuration: number;
      darkMode: boolean;
      themeMode?: ThemePreference;
      weightUnit?: WeightUnit;
    };
  };
}

export type PwaBackupAny = Record<string, unknown>;

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
  backup: PwaBackupV2;
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
