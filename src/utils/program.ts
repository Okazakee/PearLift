import type {
  MuscleFrequencyTarget,
  TrainingProgram,
  WeekConfig,
} from '@/types';

export function normalizeFrequencySummaryEntries(
  entries: Array<Pick<MuscleFrequencyTarget, 'muscleGroup' | 'targetPerWeek'>>,
) {
  const normalized = entries
    .map((entry) => ({
      muscleGroup: entry.muscleGroup.trim(),
      targetPerWeek: Math.round(entry.targetPerWeek),
    }))
    .filter(
      (entry) =>
        entry.muscleGroup.length > 0 &&
        Number.isFinite(entry.targetPerWeek) &&
        entry.targetPerWeek > 0,
    );

  return normalized.length > 0 ? normalized : undefined;
}

export function formatFrequencySummarySummary(
  entries?: MuscleFrequencyTarget[] | null,
) {
  if (!entries || entries.length === 0) {
    return null;
  }

  return entries
    .filter(
      (entry) =>
        entry.muscleGroup.trim().length > 0 &&
        Number.isFinite(entry.targetPerWeek) &&
        entry.targetPerWeek > 0,
    )
    .map(
      (entry) =>
        `${entry.muscleGroup.trim()} ${Math.round(entry.targetPerWeek)}x`,
    )
    .join(' · ');
}

export function resolveAppliedLoadModifier(input: {
  progressionModel?: TrainingProgram['progressionModel'] | null;
  loadModifier?: number | null;
}): number {
  const rawLoadModifier = input.loadModifier;
  const loadModifier =
    rawLoadModifier != null &&
    Number.isFinite(rawLoadModifier) &&
    rawLoadModifier > 0
      ? rawLoadModifier
      : 1;

  if (
    input.progressionModel === 'exercise_rules' ||
    input.progressionModel === 'mixed' ||
    input.progressionModel === 'manual'
  ) {
    return 1;
  }

  return loadModifier;
}

export function hasNamedWeekConfigs(
  weekConfigs: Array<Pick<WeekConfig, 'name'>>,
) {
  return weekConfigs.some((week) => week.name.trim().length > 0);
}

export function getWeekTitle(
  week: Pick<WeekConfig, 'id' | 'name'> | undefined,
  fallbackWeek: number,
) {
  const trimmedName = week?.name?.trim();
  return trimmedName && trimmedName.length > 0
    ? trimmedName
    : `Week ${fallbackWeek}`;
}
