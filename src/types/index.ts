export type WorkoutDay = string;
export type WeekPhase = number;
export type WeightUnit = 'kg' | 'lb';
export type ExerciseWeightMode =
  | 'total'
  | 'per_hand'
  | 'per_side'
  | 'machine_stack'
  | 'bodyweight'
  | 'assisted'
  | 'custom';

export interface WorkoutSchedule {
  type: 'fixed_day' | 'day_window' | 'rotation' | 'unscheduled';
  daysOfWeek?: number[];
  label?: string;
  preferredDay?: number;
}

export interface MuscleFrequencyTarget {
  muscleGroup: string;
  targetPerWeek: number;
  notes?: string;
}

export interface TrainingProgramSource {
  type: 'manual' | 'imported_pdf' | 'imported_json' | 'coach' | 'template';
  label?: string;
  importedAt?: string;
}

export interface TrainingProgram {
  id: string;
  name: string;
  subtitle?: string;
  goal?: string;
  description?: string;
  source?: TrainingProgramSource;
  startDate?: string;
  durationWeeks?: number;
  scheduleType?: 'fixed_weekly' | 'flexible_rotation';
  workoutIds: string[];
  frequencySummary?: MuscleFrequencyTarget[];
  progressionModel?:
    | 'simple_load_modifier'
    | 'exercise_rules'
    | 'manual'
    | 'mixed';
  defaultRestSeconds?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProgramSummary extends TrainingProgram {
  isActive: boolean;
  workoutCount: number;
}

export interface ExerciseRirTarget {
  type: 'fixed' | 'range' | 'per_set' | 'last_set_override' | 'custom';
  label: string;
  value?: number;
  values?: number[];
  min?: number;
  max?: number;
  lastSet?: number;
}

export interface ExerciseIntensityTarget {
  type: 'percent_1rm' | 'rpe' | 'rir' | 'control' | 'bodyweight' | 'custom';
  label: string;
  value?: number;
  min?: number;
  max?: number;
}

export interface ExerciseProgressionRule {
  type: string;
  label: string;
  incrementKg?: number;
  targetReps?: number;
  requiredRir?: number;
  requiredSets?: number;
  scope?: 'all_sets' | 'working_sets' | 'last_set' | 'custom';
}

export interface UnilateralPrescription {
  enabled: boolean;
  sideMode: 'per_leg' | 'per_side' | 'left_right' | 'alternating' | 'custom';
  countBothSidesAsOneSet: boolean;
  label: string;
}

export interface ExerciseWeekOverride {
  week: number;
  sets?: number;
  reps?: string;
  notes?: string;
  restSeconds?: number;
  rir?: ExerciseRirTarget;
}

export interface ExercisePerSetTarget {
  setNumber: number;
  reps?: string;
  rir?: ExerciseRirTarget;
  restSeconds?: number;
  intensity?: ExerciseIntensityTarget;
  notes?: string;
}

export interface ExerciseAdvanced {
  restSeconds?: number;
  rir?: ExerciseRirTarget;
  intensity?: ExerciseIntensityTarget;
  tempo?: string;
  progressionRule?: ExerciseProgressionRule;
  unilateral?: UnilateralPrescription;
  equipment?: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  technicalNotes?: string[];
  executionCues?: string[];
  perSetTargets?: ExercisePerSetTarget[];
  weekOverrides?: ExerciseWeekOverride[];
}

export interface WeekConfig {
  id: number;
  name: string;
  loadModifier: number;
  volumeModifier?: number;
  rir: number;
  notes?: string;
}

export interface DayConfig {
  id: string;
  name: string;
  sessionLabel?: string;
  icon: string;
  schedule?: WorkoutSchedule;
}

export interface Exercise {
  id: string;
  canonicalExerciseId?: string;
  name: string;
  aliases?: string[];
  variantLabel?: string;
  sessionSpecific?: boolean;
  sets: number;
  reps: string;
  baseWeight: number;
  muscleGroup: string;
  notes: string;
  position: number;
  advanced?: ExerciseAdvanced;
}

export interface WorkoutSession {
  id: string;
  name: string;
  description: string;
  defaultRestSeconds?: number;
  exercises: Exercise[];
}

export interface LoggedSet {
  setNumber: number;
  targetRepsLabel?: string;
  actualReps?: number;
  actualLeftReps?: number;
  actualRightReps?: number;
  plannedWeight?: number;
  actualWeight?: number;
  targetRir?: string | number;
  actualRir?: number;
  completed: boolean;
  skipped?: boolean;
}

export interface ExerciseSessionLog {
  exerciseId: string;
  exerciseNameSnapshot: string;
  prescriptionSnapshot?: Exercise;
  plannedWeight?: number;
  sets: LoggedSet[];
  notes?: string;
}

export interface WorkoutSessionLog {
  id: string;
  programId?: string;
  workoutId: string;
  workoutNameSnapshot: string;
  startedAt: string;
  completedAt?: string;
  weekNumber?: number;
  exerciseLogs: ExerciseSessionLog[];
  notes?: string;
}

export interface UserExerciseSettings {
  exerciseId: string;
  workingWeight?: number;
  weightUnit: WeightUnit;
  weightMode: ExerciseWeightMode;
  incrementKg?: number;
  estimatedOneRepMax?: number;
  notes?: string;
  updatedAt: string;
}

export type UserExerciseSettingsMap = Record<string, UserExerciseSettings>;

export interface ProgressionSuggestion {
  id: string;
  workoutLogId: string;
  exerciseId: string;
  exerciseName: string;
  ruleLabel: string;
  reason: string;
  incrementKg: number;
  currentWeightKg: number;
  suggestedWeightKg: number;
}

export type UserWeights = Record<string, number>;
