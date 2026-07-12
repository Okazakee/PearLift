import type {
  PearLiftBackupExercise,
  PearLiftBackupWorkout,
} from '@/backup/types';
import { MAX_DAY_CONFIGS } from '@/config/constants';
import { defaultDayConfigs, defaultWorkouts } from '@/data/workouts';
import type {
  DayConfig,
  Exercise,
  ExerciseAdvanced,
  ExerciseIntensityTarget,
  ExercisePerSetTarget,
  ExerciseProgressionRule,
  ExerciseRirTarget,
  ExerciseWeekOverride,
  MuscleFrequencyTarget,
  TrainingProgram,
  TrainingProgramSource,
  UnilateralPrescription,
  UserExerciseSettings,
  UserExerciseSettingsMap,
  UserWeights,
  WeekConfig,
  WorkoutSchedule,
  WorkoutSession,
} from '@/types';
import { inferUnilateralFromRepsLabel } from '@/utils/exerciseAdvanced';

export const FALLBACK_DAY_ICON = 'FitnessCenter';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function cloneDefaultWorkouts() {
  return JSON.parse(JSON.stringify(defaultWorkouts)) as WorkoutSession[];
}

function normalizeNumber(
  value: unknown,
  options: { min?: number } = {},
): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  if (options.min != null && numeric < options.min) {
    return undefined;
  }
  return numeric;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length > 0 ? items : undefined;
}

function normalizeNumberArray(
  value: unknown,
  options: { min?: number } = {},
): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => normalizeNumber(item, options))
    .filter((item): item is number => item != null);

  return items.length > 0 ? items : undefined;
}

export function normalizeWorkoutSchedule(
  value: unknown,
): WorkoutSchedule | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return undefined;
  }

  if (
    value.type !== 'fixed_day' &&
    value.type !== 'day_window' &&
    value.type !== 'rotation' &&
    value.type !== 'unscheduled'
  ) {
    return undefined;
  }

  const daysOfWeek = Array.isArray(value.daysOfWeek)
    ? value.daysOfWeek
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    : undefined;
  const preferredDay = normalizeNumber(value.preferredDay, { min: 1 });

  return {
    type: value.type,
    daysOfWeek: daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek : undefined,
    label:
      typeof value.label === 'string' && value.label.trim().length > 0
        ? value.label.trim()
        : undefined,
    preferredDay:
      preferredDay != null && preferredDay <= 7
        ? Math.round(preferredDay)
        : undefined,
  };
}

function normalizeFrequencySummary(
  value: unknown,
): MuscleFrequencyTarget[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .filter(isRecord)
    .map((item) => ({
      muscleGroup:
        typeof item.muscleGroup === 'string' ? item.muscleGroup.trim() : '',
      targetPerWeek: Number(item.targetPerWeek),
      notes:
        typeof item.notes === 'string' && item.notes.trim().length > 0
          ? item.notes.trim()
          : undefined,
    }))
    .filter(
      (item) =>
        item.muscleGroup.length > 0 &&
        Number.isFinite(item.targetPerWeek) &&
        item.targetPerWeek > 0,
    );

  return items.length > 0 ? items : undefined;
}

export function normalizeTrainingProgram(
  value: unknown,
  workouts: WorkoutSession[],
): TrainingProgram | null {
  if (!isRecord(value)) {
    return null;
  }

  const scheduleType =
    value.scheduleType === 'fixed_weekly' ||
    value.scheduleType === 'flexible_rotation'
      ? value.scheduleType
      : undefined;
  const progressionModel =
    value.progressionModel === 'simple_load_modifier' ||
    value.progressionModel === 'exercise_rules' ||
    value.progressionModel === 'manual' ||
    value.progressionModel === 'mixed'
      ? value.progressionModel
      : undefined;
  const defaultRestSeconds = normalizeNumber(value.defaultRestSeconds, {
    min: 0,
  });
  const durationWeeks = normalizeNumber(value.durationWeeks, { min: 1 });
  const source =
    isRecord(value.source) &&
    (value.source.type === 'manual' ||
      value.source.type === 'imported_pdf' ||
      value.source.type === 'imported_json' ||
      value.source.type === 'coach' ||
      value.source.type === 'template')
      ? ({
          type: value.source.type,
          ...(typeof value.source.label === 'string' &&
          value.source.label.trim().length > 0
            ? { label: value.source.label.trim() }
            : {}),
          ...(typeof value.source.importedAt === 'string' &&
          value.source.importedAt.trim().length > 0
            ? { importedAt: value.source.importedAt }
            : {}),
        } satisfies TrainingProgramSource)
      : undefined;

  return {
    id:
      typeof value.id === 'string' && value.id.trim().length > 0
        ? value.id
        : 'main-program',
    name:
      typeof value.name === 'string' && value.name.trim().length > 0
        ? value.name.trim()
        : 'Main Program',
    subtitle:
      typeof value.subtitle === 'string' && value.subtitle.trim().length > 0
        ? value.subtitle.trim()
        : undefined,
    goal:
      typeof value.goal === 'string' && value.goal.trim().length > 0
        ? value.goal.trim()
        : undefined,
    description:
      typeof value.description === 'string' &&
      value.description.trim().length > 0
        ? value.description.trim()
        : undefined,
    source,
    startDate:
      typeof value.startDate === 'string' && value.startDate.trim().length > 0
        ? value.startDate.trim()
        : undefined,
    durationWeeks:
      durationWeeks != null ? Math.round(durationWeeks) : undefined,
    scheduleType,
    workoutIds:
      Array.isArray(value.workoutIds) && value.workoutIds.length > 0
        ? value.workoutIds
            .filter((item): item is string => typeof item === 'string')
            .filter((item) => item.trim().length > 0)
        : workouts.map((workout) => workout.id),
    frequencySummary: normalizeFrequencySummary(value.frequencySummary),
    progressionModel,
    defaultRestSeconds:
      defaultRestSeconds != null ? Math.round(defaultRestSeconds) : undefined,
    createdAt:
      typeof value.createdAt === 'string' ? value.createdAt : undefined,
    updatedAt:
      typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
  };
}

function normalizeExerciseWeightMode(
  value: unknown,
): UserExerciseSettings['weightMode'] {
  return value === 'per_hand' ||
    value === 'per_side' ||
    value === 'machine_stack' ||
    value === 'bodyweight' ||
    value === 'assisted' ||
    value === 'custom'
    ? value
    : 'total';
}

export function normalizeUserExerciseSettings(
  value: unknown,
  userWeights: UserWeights,
): UserExerciseSettingsMap {
  if (!isRecord(value)) {
    return {};
  }

  const result: UserExerciseSettingsMap = {};
  for (const [exerciseId, raw] of Object.entries(value)) {
    if (!isRecord(raw) || exerciseId.trim().length === 0) {
      continue;
    }

    const weightUnit = raw.weightUnit === 'lb' ? 'lb' : 'kg';
    const weightMode = normalizeExerciseWeightMode(raw.weightMode);
    const workingWeight = normalizeNumber(raw.workingWeight, { min: 0 });
    const incrementKg = normalizeNumber(raw.incrementKg, { min: 0 });
    const estimatedOneRepMax = normalizeNumber(raw.estimatedOneRepMax, {
      min: 0,
    });
    const notes =
      typeof raw.notes === 'string' && raw.notes.trim().length > 0
        ? raw.notes.trim()
        : undefined;

    result[exerciseId] = {
      exerciseId,
      ...(workingWeight != null
        ? { workingWeight }
        : userWeights[exerciseId] != null
          ? { workingWeight: userWeights[exerciseId] }
          : {}),
      weightUnit,
      weightMode,
      ...(incrementKg != null ? { incrementKg } : {}),
      ...(estimatedOneRepMax != null ? { estimatedOneRepMax } : {}),
      ...(notes ? { notes } : {}),
      updatedAt:
        typeof raw.updatedAt === 'string' && raw.updatedAt.trim().length > 0
          ? raw.updatedAt
          : new Date().toISOString(),
    };
  }

  return result;
}

export function buildDefaultUserExerciseSettings(
  userWeights: UserWeights,
): UserExerciseSettingsMap {
  const result: UserExerciseSettingsMap = {};

  for (const [exerciseId, workingWeight] of Object.entries(userWeights)) {
    result[exerciseId] = {
      exerciseId,
      workingWeight,
      weightUnit: 'kg',
      weightMode: 'total',
      updatedAt: new Date().toISOString(),
    };
  }

  return result;
}

function normalizeRirTarget(value: unknown): ExerciseRirTarget | undefined {
  if (!isRecord(value) || typeof value.label !== 'string') {
    return undefined;
  }

  const type = value.type;
  if (
    type !== 'fixed' &&
    type !== 'range' &&
    type !== 'per_set' &&
    type !== 'last_set_override' &&
    type !== 'custom'
  ) {
    return undefined;
  }

  const values = normalizeNumberArray(value.values, { min: 0 });

  return {
    type,
    label: value.label,
    value: normalizeNumber(value.value, { min: 0 }),
    ...(values ? { values } : {}),
    min: normalizeNumber(value.min, { min: 0 }),
    max: normalizeNumber(value.max, { min: 0 }),
    lastSet: normalizeNumber(value.lastSet, { min: 0 }),
  };
}

function normalizeIntensityTarget(
  value: unknown,
): ExerciseIntensityTarget | undefined {
  if (!isRecord(value) || typeof value.label !== 'string') {
    return undefined;
  }

  const type = value.type;
  if (
    type !== 'percent_1rm' &&
    type !== 'rpe' &&
    type !== 'rir' &&
    type !== 'control' &&
    type !== 'bodyweight' &&
    type !== 'custom'
  ) {
    return undefined;
  }

  return {
    type,
    label: value.label,
    value: normalizeNumber(value.value, { min: 0 }),
    min: normalizeNumber(value.min, { min: 0 }),
    max: normalizeNumber(value.max, { min: 0 }),
  };
}

function normalizeProgressionRule(
  value: unknown,
): ExerciseProgressionRule | undefined {
  if (
    !isRecord(value) ||
    typeof value.type !== 'string' ||
    typeof value.label !== 'string'
  ) {
    return undefined;
  }

  const scope =
    value.scope === 'all_sets' ||
    value.scope === 'working_sets' ||
    value.scope === 'last_set' ||
    value.scope === 'custom'
      ? value.scope
      : undefined;

  const requiredSets = normalizeNumber(value.requiredSets, { min: 1 });

  return {
    type: value.type,
    label: value.label,
    incrementKg: normalizeNumber(value.incrementKg),
    targetReps: normalizeNumber(value.targetReps, { min: 0 }),
    requiredRir: normalizeNumber(value.requiredRir, { min: 0 }),
    ...(requiredSets != null ? { requiredSets } : {}),
    scope,
  };
}

function normalizeUnilateralPrescription(
  value: unknown,
): UnilateralPrescription | undefined {
  if (
    !isRecord(value) ||
    value.enabled !== true ||
    typeof value.label !== 'string'
  ) {
    return undefined;
  }

  const sideMode =
    value.sideMode === 'per_leg' ||
    value.sideMode === 'per_side' ||
    value.sideMode === 'left_right' ||
    value.sideMode === 'alternating' ||
    value.sideMode === 'custom'
      ? value.sideMode
      : 'custom';
  const label = value.label.trim();
  if (label.length === 0) {
    return undefined;
  }

  return {
    enabled: true,
    sideMode,
    countBothSidesAsOneSet: value.countBothSidesAsOneSet !== false,
    label,
  };
}

function normalizeWeekOverride(
  value: unknown,
): ExerciseWeekOverride | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const week = normalizeNumber(value.week, { min: 1 });
  if (week == null) {
    return undefined;
  }

  const sets = normalizeNumber(value.sets, { min: 1 });
  const restSeconds = normalizeNumber(value.restSeconds, { min: 0 });
  const rir = normalizeRirTarget(value.rir);
  const reps =
    typeof value.reps === 'string' && value.reps.trim().length > 0
      ? value.reps.trim()
      : undefined;
  const notes =
    typeof value.notes === 'string' && value.notes.trim().length > 0
      ? value.notes.trim()
      : undefined;

  if (
    sets == null &&
    reps == null &&
    notes == null &&
    restSeconds == null &&
    !rir
  ) {
    return undefined;
  }

  return {
    week: Math.round(week),
    sets: sets != null ? Math.round(sets) : undefined,
    reps,
    notes,
    restSeconds: restSeconds != null ? Math.round(restSeconds) : undefined,
    rir,
  };
}

function normalizePerSetTarget(
  value: unknown,
): ExercisePerSetTarget | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const setNumber = normalizeNumber(value.setNumber, { min: 1 });
  if (setNumber == null) {
    return undefined;
  }

  const reps =
    typeof value.reps === 'string' && value.reps.trim().length > 0
      ? value.reps.trim()
      : undefined;
  const rir = normalizeRirTarget(value.rir);
  const restSeconds = normalizeNumber(value.restSeconds, { min: 0 });
  const intensity = normalizeIntensityTarget(value.intensity);
  const notes =
    typeof value.notes === 'string' && value.notes.trim().length > 0
      ? value.notes.trim()
      : undefined;

  if (
    reps == null &&
    !rir &&
    restSeconds == null &&
    !intensity &&
    notes == null
  ) {
    return undefined;
  }

  return {
    setNumber: Math.round(setNumber),
    reps,
    rir,
    restSeconds: restSeconds != null ? Math.round(restSeconds) : undefined,
    intensity,
    notes,
  };
}

export function normalizeExerciseAdvanced(
  value: unknown,
): ExerciseAdvanced | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const advanced: ExerciseAdvanced = {};
  const restSeconds = normalizeNumber(value.restSeconds, { min: 0 });
  const rir = normalizeRirTarget(value.rir);
  const intensity = normalizeIntensityTarget(value.intensity);
  const progressionRule = normalizeProgressionRule(value.progressionRule);
  const unilateral = normalizeUnilateralPrescription(value.unilateral);
  const equipment =
    typeof value.equipment === 'string' && value.equipment.trim().length > 0
      ? value.equipment.trim()
      : undefined;
  const primaryMuscles = normalizeStringArray(value.primaryMuscles);
  const secondaryMuscles = normalizeStringArray(value.secondaryMuscles);
  const technicalNotes = normalizeStringArray(value.technicalNotes);
  const executionCues = normalizeStringArray(value.executionCues);
  const perSetTargets = Array.isArray(value.perSetTargets)
    ? value.perSetTargets
        .map((item) => normalizePerSetTarget(item))
        .filter((item): item is ExercisePerSetTarget => item !== undefined)
        .sort((a, b) => a.setNumber - b.setNumber)
    : undefined;
  const weekOverrides = Array.isArray(value.weekOverrides)
    ? value.weekOverrides
        .map((item) => normalizeWeekOverride(item))
        .filter((item): item is ExerciseWeekOverride => item !== undefined)
        .sort((a, b) => a.week - b.week)
    : undefined;

  if (restSeconds != null) {
    advanced.restSeconds = Math.round(restSeconds);
  }
  if (rir) {
    advanced.rir = rir;
  }
  if (intensity) {
    advanced.intensity = intensity;
  }
  if (typeof value.tempo === 'string' && value.tempo.trim().length > 0) {
    advanced.tempo = value.tempo.trim();
  }
  if (progressionRule) {
    advanced.progressionRule = progressionRule;
  }
  if (unilateral) {
    advanced.unilateral = unilateral;
  }
  if (equipment) {
    advanced.equipment = equipment;
  }
  if (primaryMuscles) {
    advanced.primaryMuscles = primaryMuscles;
  }
  if (secondaryMuscles) {
    advanced.secondaryMuscles = secondaryMuscles;
  }
  if (technicalNotes) {
    advanced.technicalNotes = technicalNotes;
  }
  if (executionCues) {
    advanced.executionCues = executionCues;
  }
  if (perSetTargets && perSetTargets.length > 0) {
    advanced.perSetTargets = perSetTargets;
  }
  if (weekOverrides && weekOverrides.length > 0) {
    advanced.weekOverrides = weekOverrides;
  }

  return Object.keys(advanced).length > 0 ? advanced : undefined;
}

export function normalizeExercise(
  exercise: PearLiftBackupExercise,
  fallbackPosition: number,
): Exercise {
  const canonicalExerciseId =
    typeof exercise.canonicalExerciseId === 'string' &&
    exercise.canonicalExerciseId.trim().length > 0
      ? exercise.canonicalExerciseId.trim()
      : undefined;
  const aliases = normalizeStringArray(exercise.aliases);
  const variantLabel =
    typeof exercise.variantLabel === 'string' &&
    exercise.variantLabel.trim().length > 0
      ? exercise.variantLabel.trim()
      : undefined;
  const reps = String(exercise.reps ?? '8-10');
  const normalizedAdvanced = normalizeExerciseAdvanced(exercise.advanced);
  const inferredUnilateral =
    normalizedAdvanced?.unilateral == null
      ? inferUnilateralFromRepsLabel(reps)
      : undefined;

  return {
    id: String(exercise.id ?? `exercise-${fallbackPosition}`),
    ...(canonicalExerciseId ? { canonicalExerciseId } : {}),
    name: String(exercise.name ?? 'Exercise'),
    ...(aliases ? { aliases } : {}),
    ...(variantLabel ? { variantLabel } : {}),
    ...(exercise.sessionSpecific === true ? { sessionSpecific: true } : {}),
    sets: Number.isFinite(Number(exercise.sets)) ? Number(exercise.sets) : 2,
    reps,
    baseWeight: Number.isFinite(Number(exercise.baseWeight))
      ? Number(exercise.baseWeight)
      : 0,
    muscleGroup: String(exercise.muscleGroup ?? 'Full Body'),
    notes: typeof exercise.notes === 'string' ? exercise.notes : '',
    position: Number.isFinite(Number(exercise.position))
      ? Number(exercise.position)
      : fallbackPosition,
    advanced:
      normalizedAdvanced || inferredUnilateral
        ? {
            ...(normalizedAdvanced ?? {}),
            ...(inferredUnilateral ? { unilateral: inferredUnilateral } : {}),
          }
        : undefined,
  };
}

export function normalizeWorkout(
  workout: PearLiftBackupWorkout,
): WorkoutSession {
  const rawExercises = Array.isArray(workout.exercises)
    ? workout.exercises
    : [];
  const normalizedExercises = rawExercises
    .map((exercise, index) => normalizeExercise(exercise, index))
    .sort((a, b) => a.position - b.position)
    .map((exercise, index) => ({ ...exercise, position: index }));

  return {
    id: String(workout.id ?? 'workout'),
    name: String(workout.name ?? 'Workout'),
    description: String(workout.description ?? ''),
    defaultRestSeconds: normalizeNumber(workout.defaultRestSeconds, {
      min: 0,
    }),
    exercises: normalizedExercises,
  };
}

export function normalizeWeekConfigs(value: unknown): WeekConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  const valid = value
    .filter(isRecord)
    .map((week, index) => ({
      id: Number.isFinite(Number(week.id)) ? Number(week.id) : index + 1,
      name:
        typeof week.name === 'string' && week.name.length > 0
          ? week.name
          : `Week ${index + 1}`,
      loadModifier: Number.isFinite(Number(week.loadModifier))
        ? Number(week.loadModifier)
        : 1,
      volumeModifier: Number.isFinite(Number(week.volumeModifier))
        ? Number(week.volumeModifier)
        : 1,
      rir: Number.isFinite(Number(week.rir)) ? Number(week.rir) : 2,
      ...(typeof week.notes === 'string' && week.notes.trim().length > 0
        ? { notes: week.notes.trim() }
        : {}),
    }))
    .sort((a, b) => a.id - b.id);

  return valid;
}

export function normalizeDayConfigs(
  value: unknown,
  workouts: WorkoutSession[] = [],
  options: { fallbackToDefault?: boolean } = {},
): DayConfig[] {
  const fallbackToDefault = options.fallbackToDefault ?? false;
  const raw = Array.isArray(value) ? value : [];

  const seen = new Set<string>();
  const merged: DayConfig[] = [];

  for (const day of raw) {
    if (!isRecord(day)) continue;
    if (seen.has(String(day.id ?? ''))) continue;
    seen.add(String(day.id ?? ''));
    if (merged.length >= MAX_DAY_CONFIGS) break;
    merged.push({
      id:
        typeof day.id === 'string' && day.id.length > 0
          ? day.id
          : `day-${merged.length + 1}`,
      name:
        typeof day.name === 'string' && day.name.length > 0
          ? day.name
          : `Day ${merged.length + 1}`,
      ...(typeof day.sessionLabel === 'string' && day.sessionLabel.trim().length
        ? { sessionLabel: day.sessionLabel.trim() }
        : {}),
      icon:
        typeof day.icon === 'string' && day.icon.length > 0
          ? day.icon
          : FALLBACK_DAY_ICON,
      schedule: normalizeWorkoutSchedule(day.schedule),
    });
  }

  for (const workout of workouts) {
    if (merged.length >= MAX_DAY_CONFIGS) break;
    if (seen.has(workout.id)) continue;
    seen.add(workout.id);
    merged.push(deriveDayConfigFromWorkout(workout, merged.length));
  }

  if (merged.length > 0) return merged;
  return fallbackToDefault ? defaultDayConfigs : [];
}

export function deriveDayConfigFromWorkout(
  workout: WorkoutSession,
  fallbackIndex: number,
): DayConfig {
  return {
    id: workout.id,
    name:
      typeof workout.name === 'string' && workout.name.length > 0
        ? workout.name
        : `Day ${fallbackIndex + 1}`,
    icon: FALLBACK_DAY_ICON,
  };
}

export function reconcileDayConfigs(
  workouts: WorkoutSession[],
  dayConfigs: DayConfig[],
): DayConfig[] {
  const workoutById = new Map(workouts.map((workout) => [workout.id, workout]));
  const seen = new Set<string>();
  const merged: DayConfig[] = [];

  for (const day of dayConfigs) {
    if (seen.has(day.id)) continue;
    seen.add(day.id);
    if (merged.length >= MAX_DAY_CONFIGS) break;
    merged.push(day);
  }

  for (const [workoutId, workout] of workoutById) {
    if (merged.length >= MAX_DAY_CONFIGS) break;
    if (seen.has(workoutId)) continue;
    seen.add(workoutId);
    merged.push(deriveDayConfigFromWorkout(workout, merged.length));
  }

  return merged.length > 0 ? merged : defaultDayConfigs;
}

export function alignWorkoutsToDays(
  workouts: WorkoutSession[],
  dayConfigs: DayConfig[],
): WorkoutSession[] {
  const byId = new Map(workouts.map((workout) => [workout.id, workout]));
  return dayConfigs.slice(0, MAX_DAY_CONFIGS).map((day, index) => {
    const existing = byId.get(day.id);
    if (existing) return existing;

    return {
      id: day.id,
      name: `${day.name} Day`,
      description: `Custom session ${index + 1}`,
      exercises: [],
    };
  });
}

export function normalizeWeights(
  raw: unknown,
  workouts: WorkoutSession[],
): UserWeights {
  const source = isRecord(raw) ? raw : {};
  const weights: UserWeights = {};

  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      const value = source[exercise.id];
      weights[exercise.id] =
        typeof value === 'number' && Number.isFinite(value) ? value : 0;
    }
  }

  return weights;
}

export function clampWeek(currentWeek: number, weekConfigs: WeekConfig[]) {
  const weekIds = weekConfigs.map((week) => week.id);
  if (weekIds.length === 0) return Math.max(1, Math.round(currentWeek));
  if (weekIds.includes(currentWeek)) return currentWeek;
  return weekIds[0] ?? 1;
}

export function normalizeCurrentDay(
  currentDay: string,
  dayConfigs: DayConfig[],
) {
  if (dayConfigs.some((day) => day.id === currentDay)) {
    return currentDay;
  }
  return dayConfigs[0]?.id ?? 'push';
}
