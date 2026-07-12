import type {
  ExerciseProgressionRule,
  LoggedSet,
  ProgressionSuggestion,
  UserExerciseSettingsMap,
  UserWeights,
  WorkoutSessionLog,
} from '@/types';
import { roundToHalf } from '@/utils/math';
import { getEffectiveLoggedReps } from '@/utils/workoutLog';

function buildSuggestionId(
  workoutLogId: string,
  exerciseId: string,
  ruleLabel: string,
) {
  return `${workoutLogId}:${exerciseId}:${ruleLabel}`;
}

function getCandidateSets(
  sets: LoggedSet[],
  scope: ExerciseProgressionRule['scope'],
) {
  if (scope === 'last_set') {
    const lastSet = sets[sets.length - 1];
    return lastSet ? [lastSet] : [];
  }

  return sets;
}

function formatSuggestionReason(
  setCount: number,
  rule: ExerciseProgressionRule,
): string {
  const repsLabel =
    rule.targetReps != null && Number.isFinite(rule.targetReps)
      ? `${setCount} x ${rule.targetReps}`
      : `${setCount} sets`;

  if (rule.requiredRir != null && Number.isFinite(rule.requiredRir)) {
    return `Completed ${repsLabel} at RIR ${rule.requiredRir} or lower`;
  }

  return `Completed ${repsLabel}`;
}

function setMatchesRule(
  set: LoggedSet,
  rule: ExerciseProgressionRule,
): boolean {
  const actualReps = getEffectiveLoggedReps(set);
  if (!set.completed || set.skipped) {
    return false;
  }
  if (
    rule.targetReps == null ||
    !Number.isFinite(rule.targetReps) ||
    actualReps == null ||
    actualReps < rule.targetReps
  ) {
    return false;
  }
  if (rule.requiredRir == null) {
    return true;
  }
  if (set.actualRir == null) {
    return false;
  }
  return set.actualRir <= rule.requiredRir;
}

function getMatchedCandidateSets(
  exerciseLog: WorkoutSessionLog['exerciseLogs'][number],
  rule: ExerciseProgressionRule,
): LoggedSet[] | null {
  const candidateSets = getCandidateSets(exerciseLog.sets, rule.scope);
  if (!candidateSets.length) {
    return null;
  }
  if (
    rule.requiredSets != null &&
    Number.isFinite(rule.requiredSets) &&
    candidateSets.length !== rule.requiredSets
  ) {
    return null;
  }

  return candidateSets.every((set) => setMatchesRule(set, rule))
    ? candidateSets
    : null;
}

export function buildProgressionSuggestions(input: {
  workoutLog: WorkoutSessionLog;
  userExerciseSettings?: UserExerciseSettingsMap;
  userWeights: UserWeights;
}) {
  if (!input.workoutLog.completedAt) {
    return [] as ProgressionSuggestion[];
  }

  const suggestions: ProgressionSuggestion[] = [];

  for (const exerciseLog of input.workoutLog.exerciseLogs) {
    const rule = exerciseLog.prescriptionSnapshot?.advanced?.progressionRule;
    if (
      rule?.type !== 'load_increment_when_top_reps_at_rir' ||
      rule.incrementKg == null ||
      !Number.isFinite(rule.incrementKg)
    ) {
      continue;
    }
    const matchedSets = getMatchedCandidateSets(exerciseLog, rule);
    if (!matchedSets) {
      continue;
    }

    const currentWeightKg =
      input.userExerciseSettings?.[exerciseLog.exerciseId]?.workingWeight ??
      input.userWeights[exerciseLog.exerciseId] ??
      exerciseLog.plannedWeight ??
      0;
    const suggestedWeightKg = roundToHalf(currentWeightKg + rule.incrementKg);

    suggestions.push({
      id: buildSuggestionId(
        input.workoutLog.id,
        exerciseLog.exerciseId,
        rule.label,
      ),
      workoutLogId: input.workoutLog.id,
      exerciseId: exerciseLog.exerciseId,
      exerciseName: exerciseLog.exerciseNameSnapshot,
      ruleLabel: rule.label,
      reason: formatSuggestionReason(matchedSets.length, rule),
      incrementKg: rule.incrementKg,
      currentWeightKg,
      suggestedWeightKg,
    });
  }

  return suggestions;
}
