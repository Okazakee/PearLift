import type { ThemePreference } from '@/theme/tokens';
import type {
  DayConfig,
  Exercise,
  ExerciseAdvanced,
  TrainingProgram,
  UserExerciseSettingsMap,
  UserWeights,
  WeekConfig,
  WeightUnit,
  WorkoutDay,
  WorkoutSession,
  WorkoutSessionLog,
} from '@/types';

export const CURRENT_BACKUP_VERSION = 4 as const;
export const CURRENT_BACKUP_FORMAT = 'pearlift.backup.v4' as const;

export interface PearLiftBackupExercise
  extends Omit<Exercise, 'notes' | 'position' | 'advanced'> {
  notes?: string;
  position?: number;
  advanced?: ExerciseAdvanced;
}

export interface PearLiftBackupWorkout
  extends Omit<WorkoutSession, 'exercises'> {
  programId?: string;
  exercises: PearLiftBackupExercise[];
}

export interface PearLiftBackupWeekConfig extends WeekConfig {
  programId?: string;
}

export interface PearLiftBackupDayConfig extends DayConfig {
  programId?: string;
}

interface PearLiftBackupData {
  program?: TrainingProgram | null;
  programs?: TrainingProgram[];
  activeProgramId?: string;
  workouts: PearLiftBackupWorkout[];
  userWeights: UserWeights;
  userExerciseSettings?: UserExerciseSettingsMap;
  sessionLogs?: WorkoutSessionLog[];
  weekConfigs?: PearLiftBackupWeekConfig[];
  dayConfigs?: PearLiftBackupDayConfig[];
  settings: {
    currentWeek: number;
    currentDay?: WorkoutDay;
    restDuration: number;
    themeMode: ThemePreference;
    weightUnit: WeightUnit;
    language: string;
  };
}

export interface PearLiftBackupV3 {
  version: 3;
  exportedAt: string;
  data: PearLiftBackupData;
}

export interface PearLiftBackupV4 {
  version: typeof CURRENT_BACKUP_VERSION;
  exportedAt: string;
  app: {
    name: 'PearLift';
    platform: 'mobile';
    backupFormat: typeof CURRENT_BACKUP_FORMAT;
  };
  data: PearLiftBackupData;
}

export type PearLiftBackupAny = Record<string, unknown>;
export type PearLiftBackup = PearLiftBackupV3 | PearLiftBackupV4;

export interface PearLiftRuntimeState {
  program?: TrainingProgram | null;
  workouts: WorkoutSession[];
  userWeights: UserWeights;
  userExerciseSettings?: UserExerciseSettingsMap;
  weekConfigs: WeekConfig[];
  dayConfigs: DayConfig[];
  currentWeek: number;
  currentDay: WorkoutDay;
  restDuration: number;
  themeMode: ThemePreference;
  weightUnit: WeightUnit;
  language: string;
}

export interface BackupProgramState extends PearLiftRuntimeState {
  program: TrainingProgram;
  sessionLogs: WorkoutSessionLog[];
}

export interface BackupProgramCollection {
  programs: BackupProgramState[];
  activeProgramId: string | null;
}

export interface MigratedBackupResult {
  backup: PearLiftBackupV4;
  runtime: PearLiftRuntimeState;
  sessionLogs: WorkoutSessionLog[];
  collection: BackupProgramCollection;
}

export interface WorkoutChange {
  workoutId: string;
  name: string;
  added: number;
  removed: number;
  modified: number;
}

export interface ExerciseImportChange {
  exerciseId: string;
  name: string;
  workoutId: string;
  workoutName: string;
}

export interface PreservedWeightChange extends ExerciseImportChange {
  weight: number;
}

export interface SettingChange {
  key: string;
  from: string;
  to: string;
}

export interface ChangeSummary {
  programName: string;
  workouts: WorkoutChange[];
  matchingExercises: ExerciseImportChange[];
  changedExercises: ExerciseImportChange[];
  newExercises: ExerciseImportChange[];
  removedExercises: ExerciseImportChange[];
  preservedWeights: PreservedWeightChange[];
  missingWeightExercises: ExerciseImportChange[];
  programMetadata: SettingChange[];
  settings: SettingChange[];
  weekConfigs: SettingChange[];
  dayConfigs: SettingChange[];
  incomingWorkoutCount: number;
  incomingExerciseCount: number;
  totalChanges: number;
}
