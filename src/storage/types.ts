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
  | { type: 'resetAllData' }
  | {
      type: 'restoreRuntimeState';
      runtime: PearLiftRuntimeState;
      source: 'local-import' | 'migration';
    };

export interface WorkoutStoreSnapshot extends PearLiftRuntimeState {
  isHydrating: boolean;
  isSetupDone: boolean;
}
