import type {
  ExerciseIntensityTarget,
  ExerciseWeightMode,
  UserExerciseSettings,
  WeightUnit,
} from '@/types';
import { roundToHalf } from '@/utils/math';
import {
  formatWeight,
  formatWeightUnit,
  fromDisplayWeight,
  toDisplayWeight,
} from '@/utils/units';

export const EXERCISE_WEIGHT_MODES: ExerciseWeightMode[] = [
  'total',
  'per_hand',
  'per_side',
  'machine_stack',
  'bodyweight',
  'assisted',
  'custom',
];

export function formatExerciseSettingInputValue(
  value: number | null | undefined,
  weightUnit: WeightUnit,
): string {
  if (value == null || !Number.isFinite(value)) {
    return '';
  }
  return formatWeight(toDisplayWeight(value, weightUnit), weightUnit);
}

export function formatExerciseSettingValueLabel(
  value: number | null | undefined,
  weightUnit: WeightUnit,
): string | null {
  const formatted = formatExerciseSettingInputValue(value, weightUnit);
  if (formatted.length === 0) {
    return null;
  }
  return `${formatted} ${formatWeightUnit(weightUnit)}`;
}

export function parseExerciseSettingInputValue(
  value: string,
  weightUnit: WeightUnit,
): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return fromDisplayWeight(parsed, weightUnit);
}

export function buildWorkingWeightSettingUpdate(input: {
  exerciseId: string;
  workingWeight: number;
  current?: UserExerciseSettings | null;
  weightUnit: WeightUnit;
  updatedAt: string;
}): UserExerciseSettings {
  return {
    exerciseId: input.exerciseId,
    workingWeight: input.workingWeight,
    weightUnit: input.current?.weightUnit ?? input.weightUnit,
    weightMode: input.current?.weightMode ?? 'total',
    ...(input.current?.incrementKg != null
      ? { incrementKg: input.current.incrementKg }
      : {}),
    ...(input.current?.estimatedOneRepMax != null
      ? { estimatedOneRepMax: input.current.estimatedOneRepMax }
      : {}),
    ...(input.current?.notes ? { notes: input.current.notes } : {}),
    updatedAt: input.updatedAt,
  };
}

export function buildUserExerciseSettings(input: {
  exerciseId: string;
  workingWeight: string;
  incrementKg: string;
  estimatedOneRepMax?: string;
  notes?: string;
  current?: UserExerciseSettings | null;
  weightMode: ExerciseWeightMode;
  weightUnit: WeightUnit;
  updatedAt: string;
}): UserExerciseSettings | null {
  const parsedWeight = parseExerciseSettingInputValue(
    input.workingWeight,
    input.weightUnit,
  );
  const trimmedIncrement = input.incrementKg.trim();
  const parsedIncrement =
    trimmedIncrement.length > 0 ? Number(trimmedIncrement) : null;
  const parsedEstimatedOneRepMax = parseExerciseSettingInputValue(
    input.estimatedOneRepMax ?? '',
    input.weightUnit,
  );
  const trimmedNotes = input.notes?.trim() ?? '';
  const hasValues =
    parsedWeight != null ||
    (parsedIncrement != null &&
      Number.isFinite(parsedIncrement) &&
      parsedIncrement >= 0) ||
    parsedEstimatedOneRepMax != null ||
    trimmedNotes.length > 0 ||
    input.weightMode !== 'total';

  if (!hasValues && !input.current) {
    return null;
  }

  return {
    exerciseId: input.exerciseId,
    ...(parsedWeight != null ? { workingWeight: parsedWeight } : {}),
    weightUnit: input.weightUnit,
    weightMode: input.weightMode,
    ...(parsedIncrement != null &&
    Number.isFinite(parsedIncrement) &&
    parsedIncrement >= 0
      ? { incrementKg: parsedIncrement }
      : {}),
    ...(parsedEstimatedOneRepMax != null
      ? { estimatedOneRepMax: parsedEstimatedOneRepMax }
      : {}),
    ...(trimmedNotes.length > 0 ? { notes: trimmedNotes } : {}),
    updatedAt: input.updatedAt,
  };
}

export function getWeightModeLabel(mode: ExerciseWeightMode): string {
  switch (mode) {
    case 'per_hand':
      return 'Per hand';
    case 'per_side':
      return 'Per side';
    case 'machine_stack':
      return 'Machine stack';
    case 'bodyweight':
      return 'Bodyweight';
    case 'assisted':
      return 'Assisted';
    case 'custom':
      return 'Custom';
    default:
      return 'Total';
  }
}

export function getIntensityRangeLabel(input: {
  intensity?: ExerciseIntensityTarget | null;
  settings?: UserExerciseSettings | null;
  weightUnit: WeightUnit;
}) {
  const estimatedOneRepMax = input.settings?.estimatedOneRepMax;
  if (
    input.intensity?.type !== 'percent_1rm' ||
    estimatedOneRepMax == null ||
    !Number.isFinite(estimatedOneRepMax)
  ) {
    return null;
  }

  const minPercent =
    input.intensity.min ?? input.intensity.value ?? input.intensity.max;
  const maxPercent =
    input.intensity.max ?? input.intensity.value ?? input.intensity.min;
  if (
    minPercent == null ||
    maxPercent == null ||
    !Number.isFinite(minPercent) ||
    !Number.isFinite(maxPercent)
  ) {
    return null;
  }

  const minWeight = roundToHalf((estimatedOneRepMax * minPercent) / 100);
  const maxWeight = roundToHalf((estimatedOneRepMax * maxPercent) / 100);
  const minDisplay = formatWeight(
    toDisplayWeight(minWeight, input.weightUnit),
    input.weightUnit,
  );
  const maxDisplay = formatWeight(
    toDisplayWeight(maxWeight, input.weightUnit),
    input.weightUnit,
  );

  return minDisplay === maxDisplay
    ? `${minDisplay} ${formatWeightUnit(input.weightUnit)}`
    : `${minDisplay}-${maxDisplay} ${formatWeightUnit(input.weightUnit)}`;
}
