import type {
  Exercise,
  ExerciseIntensityTarget,
  ExercisePerSetTarget,
  ExerciseProgressionRule,
  ExerciseRirTarget,
  ExerciseWeekOverride,
  UnilateralPrescription,
} from '@/types';

export function parseLineList(value: string): string[] | undefined {
  const items = value
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length > 0 ? items : undefined;
}

export function parseRirInput(label: string): ExerciseRirTarget | undefined {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const perSetMatch = /^\d+(?:\s*(?:\/|,)\s*\d+)+$/.exec(trimmed);
  if (perSetMatch) {
    const values = trimmed
      .split(/\s*(?:\/|,)\s*/)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));
    if (values.length > 1) {
      return {
        type: 'per_set',
        values,
        label: trimmed,
      };
    }
  }

  const lastSetOverrideMatch =
    /^(\d+)\s*(?:\+\s*|,\s*)last(?:\s*set)?\s*(\d+)$/i.exec(trimmed);
  if (lastSetOverrideMatch) {
    const value = Number(lastSetOverrideMatch[1]);
    const lastSet = Number(lastSetOverrideMatch[2]);
    if (Number.isFinite(value) && Number.isFinite(lastSet)) {
      return {
        type: 'last_set_override',
        value,
        lastSet,
        label: trimmed,
      };
    }
  }

  const lastSetOnlyMatch = /^last(?:\s*set)?\s*(\d+)$/i.exec(trimmed);
  if (lastSetOnlyMatch) {
    const lastSet = Number(lastSetOnlyMatch[1]);
    if (Number.isFinite(lastSet)) {
      return {
        type: 'last_set_override',
        lastSet,
        label: trimmed,
      };
    }
  }

  const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return {
        type: 'range',
        min,
        max,
        label: trimmed,
      };
    }
  }

  const fixed = Number(trimmed);
  if (Number.isFinite(fixed)) {
    return {
      type: 'fixed',
      value: fixed,
      label: trimmed,
    };
  }

  return {
    type: 'custom',
    label: trimmed,
  };
}

export function formatRirInput(target?: ExerciseRirTarget | null): string {
  if (!target) {
    return '';
  }

  if (target.type === 'per_set' && target.values?.length) {
    return target.values.join(' / ');
  }

  if (target.type === 'last_set_override') {
    if (target.value != null && target.lastSet != null) {
      return `${target.value} + last ${target.lastSet}`;
    }
    if (target.lastSet != null) {
      return `last ${target.lastSet}`;
    }
  }

  return target.label;
}

export function parseIntensityInput(
  label: string,
): ExerciseIntensityTarget | undefined {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (
    trimmed.toLowerCase() === 'control' ||
    trimmed.toLowerCase() === 'controllo'
  ) {
    return {
      type: 'control',
      label: trimmed,
    };
  }

  const rangeMatch =
    /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*%?(?:\s*1RM)?$/i.exec(trimmed);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return {
        type: 'percent_1rm',
        min,
        max,
        label: trimmed,
      };
    }
  }

  const fixedMatch = /^(\d+(?:\.\d+)?)\s*%?(?:\s*1RM)?$/i.exec(trimmed);
  if (fixedMatch) {
    const value = Number(fixedMatch[1]);
    if (Number.isFinite(value)) {
      return {
        type: 'percent_1rm',
        value,
        label: trimmed,
      };
    }
  }

  return {
    type: 'custom',
    label: trimmed,
  };
}

export function parseProgressionRuleInput(
  label: string,
): ExerciseProgressionRule | undefined {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const incrementMatch = /^\+\s*(\d+(?:\.\d+)?)\s*kg\b/i.exec(trimmed);
  const incrementKg = incrementMatch ? Number(incrementMatch[1]) : null;
  const requiredRirMatch = /\bwith\s+(\d+(?:\.\d+)?)\s*rir\b/i.exec(trimmed);
  const requiredRir = requiredRirMatch ? Number(requiredRirMatch[1]) : null;
  const allSetsMatch =
    /\ball\s+sets(?:\s+(?:hit|reach|are))?\s+(\d+)\s*reps?\b/i.exec(trimmed);
  const setTimesRepsMatch = /\b(\d+)\s*x\s*(\d+)\b/i.exec(trimmed);

  if (incrementKg != null && Number.isFinite(incrementKg)) {
    if (allSetsMatch) {
      const targetReps = Number(allSetsMatch[1]);
      if (Number.isFinite(targetReps)) {
        return {
          type: 'load_increment_when_top_reps_at_rir',
          label: trimmed,
          incrementKg,
          targetReps,
          requiredRir:
            requiredRir != null && Number.isFinite(requiredRir)
              ? requiredRir
              : undefined,
          scope: 'all_sets',
        };
      }
    }

    if (setTimesRepsMatch) {
      const requiredSets = Number(setTimesRepsMatch[1]);
      const targetReps = Number(setTimesRepsMatch[2]);
      if (Number.isFinite(requiredSets) && Number.isFinite(targetReps)) {
        return {
          type: 'load_increment_when_top_reps_at_rir',
          label: trimmed,
          incrementKg,
          targetReps,
          requiredRir:
            requiredRir != null && Number.isFinite(requiredRir)
              ? requiredRir
              : undefined,
          requiredSets,
          scope: 'all_sets',
        };
      }
    }
  }

  return {
    type: 'custom_text',
    label: trimmed,
  };
}

export function formatProgressionRuleChipLabel(
  rule?: ExerciseProgressionRule | null,
): string | null {
  if (
    rule?.type !== 'load_increment_when_top_reps_at_rir' ||
    rule.incrementKg == null ||
    !Number.isFinite(rule.incrementKg)
  ) {
    return null;
  }

  return `+${rule.incrementKg}kg rule`;
}

export function parseUnilateralInput(
  label: string,
): UnilateralPrescription | undefined {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === 'per leg' || normalized === 'per gamba') {
    return {
      enabled: true,
      sideMode: 'per_leg',
      countBothSidesAsOneSet: true,
      label: 'per leg',
    };
  }
  if (normalized === 'per side' || normalized === 'per lato') {
    return {
      enabled: true,
      sideMode: 'per_side',
      countBothSidesAsOneSet: true,
      label: 'per side',
    };
  }
  if (normalized === 'left/right' || normalized === 'left right') {
    return {
      enabled: true,
      sideMode: 'left_right',
      countBothSidesAsOneSet: true,
      label: 'left/right',
    };
  }
  if (normalized === 'alternating' || normalized === 'alternato') {
    return {
      enabled: true,
      sideMode: 'alternating',
      countBothSidesAsOneSet: true,
      label: 'alternating',
    };
  }

  return {
    enabled: true,
    sideMode: 'custom',
    countBothSidesAsOneSet: true,
    label: trimmed,
  };
}

export function inferUnilateralFromRepsLabel(
  reps: string,
): UnilateralPrescription | undefined {
  const normalized = reps.trim().toLowerCase();
  if (normalized.length === 0) {
    return undefined;
  }

  if (/\/\s*(?:x\s*)?(?:gamba|leg|per\s+leg)\b/.test(normalized)) {
    return {
      enabled: true,
      sideMode: 'per_leg',
      countBothSidesAsOneSet: true,
      label: 'per leg',
    };
  }

  if (/\/\s*(?:l|lato|side|per\s+side)\b/.test(normalized)) {
    return {
      enabled: true,
      sideMode: 'per_side',
      countBothSidesAsOneSet: true,
      label: 'per side',
    };
  }

  if (
    /\/\s*(?:left\s*\/\s*right|left\s+right|sx\s*\/\s*dx|dx\s*\/\s*sx)\b/.test(
      normalized,
    )
  ) {
    return {
      enabled: true,
      sideMode: 'left_right',
      countBothSidesAsOneSet: true,
      label: 'left/right',
    };
  }

  return undefined;
}

export function formatRepsLabel(
  reps: string,
  unilateral?: UnilateralPrescription,
): string {
  if (inferUnilateralFromRepsLabel(reps)) {
    return reps;
  }

  if (!unilateral?.enabled || unilateral.label.trim().length === 0) {
    return reps;
  }

  const normalizedReps = reps.trim().toLowerCase();
  const normalizedLabel = unilateral.label.trim().toLowerCase();
  const suffix =
    unilateral.sideMode === 'per_leg'
      ? 'leg'
      : unilateral.sideMode === 'per_side'
        ? 'side'
        : unilateral.label.trim();
  if (
    normalizedReps.includes(normalizedLabel) ||
    normalizedReps.includes('/ side') ||
    normalizedReps.includes('/ leg')
  ) {
    return reps;
  }

  return `${reps} / ${suffix}`;
}

export function parseWeekOverridesInput(
  value: string,
): ExerciseWeekOverride[] | undefined {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const overrides = lines
    .map((line) => {
      const headerMatch = /^(?:w(?:eek)?\s*)?(\d+)\s*:\s*(.+)$/i.exec(line);
      if (!headerMatch) {
        return null;
      }

      const week = Number(headerMatch[1]);
      if (!Number.isFinite(week) || week < 1) {
        return null;
      }

      const override: ExerciseWeekOverride = { week };
      const fields = headerMatch[2]
        .split(';')
        .map((field) => field.trim())
        .filter((field) => field.length > 0);

      for (const field of fields) {
        const separatorIndex = field.indexOf('=');
        if (separatorIndex <= 0) {
          continue;
        }

        const rawKey = field.slice(0, separatorIndex).trim().toLowerCase();
        const rawValue = field.slice(separatorIndex + 1).trim();
        if (rawValue.length === 0) {
          continue;
        }

        switch (rawKey) {
          case 'sets': {
            const sets = Number(rawValue);
            if (Number.isFinite(sets) && sets > 0 && Number.isInteger(sets)) {
              override.sets = sets;
            }
            break;
          }
          case 'reps':
            override.reps = rawValue;
            break;
          case 'rest':
          case 'restseconds': {
            const restSeconds = Number(rawValue);
            if (
              Number.isFinite(restSeconds) &&
              restSeconds >= 0 &&
              Number.isInteger(restSeconds)
            ) {
              override.restSeconds = restSeconds;
            }
            break;
          }
          case 'rir':
            override.rir = parseRirInput(rawValue);
            break;
          case 'notes':
            override.notes = rawValue;
            break;
          default:
            break;
        }
      }

      return Object.keys(override).length > 1 ? override : null;
    })
    .filter((item): item is ExerciseWeekOverride => item != null)
    .sort((a, b) => a.week - b.week);

  return overrides.length > 0 ? overrides : undefined;
}

export function parsePerSetTargetsInput(
  value: string,
): ExercisePerSetTarget[] | undefined {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const targets = lines
    .map((line) => {
      const headerMatch = /^(?:s(?:et)?\s*)?(\d+)\s*:\s*(.+)$/i.exec(line);
      if (!headerMatch) {
        return null;
      }

      const setNumber = Number(headerMatch[1]);
      if (!Number.isFinite(setNumber) || setNumber < 1) {
        return null;
      }

      const target: ExercisePerSetTarget = {
        setNumber: Math.round(setNumber),
      };
      const fields = headerMatch[2]
        .split(';')
        .map((field) => field.trim())
        .filter((field) => field.length > 0);

      for (const field of fields) {
        const separatorIndex = field.indexOf('=');
        if (separatorIndex <= 0) {
          continue;
        }

        const rawKey = field.slice(0, separatorIndex).trim().toLowerCase();
        const rawValue = field.slice(separatorIndex + 1).trim();
        if (rawValue.length === 0) {
          continue;
        }

        switch (rawKey) {
          case 'reps':
            target.reps = rawValue;
            break;
          case 'rir':
            target.rir = parseRirInput(rawValue);
            break;
          case 'rest':
          case 'restseconds': {
            const restSeconds = Number(rawValue);
            if (
              Number.isFinite(restSeconds) &&
              restSeconds >= 0 &&
              Number.isInteger(restSeconds)
            ) {
              target.restSeconds = restSeconds;
            }
            break;
          }
          case 'intensity':
            target.intensity = parseIntensityInput(rawValue);
            break;
          case 'notes':
            target.notes = rawValue;
            break;
          default:
            break;
        }
      }

      return Object.keys(target).length > 1 ? target : null;
    })
    .filter((item): item is ExercisePerSetTarget => item != null)
    .sort((a, b) => a.setNumber - b.setNumber);

  return targets.length > 0 ? targets : undefined;
}

export function formatPerSetTargetsInput(
  targets?: ExercisePerSetTarget[] | null,
): string {
  if (!targets?.length) {
    return '';
  }

  return [...targets]
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((target) => {
      const fields = [
        target.reps ? `reps=${target.reps}` : null,
        target.rir ? `rir=${formatRirInput(target.rir)}` : null,
        target.restSeconds != null ? `rest=${target.restSeconds}` : null,
        target.intensity ? `intensity=${target.intensity.label}` : null,
        target.notes ? `notes=${target.notes}` : null,
      ].filter((item): item is string => item != null);

      return `S${target.setNumber}: ${fields.join('; ')}`;
    })
    .join('\n');
}

export function formatPerSetTargetSummary(
  target: ExercisePerSetTarget,
  unilateral?: UnilateralPrescription,
): string {
  const parts = [
    target.reps ? formatRepsLabel(target.reps, unilateral) : null,
    target.rir ? `RIR ${formatRirInput(target.rir)}` : null,
    target.restSeconds != null ? `Rest ${target.restSeconds}s` : null,
    target.intensity?.label ?? null,
    target.notes ?? null,
  ].filter((item): item is string => item != null && item.length > 0);

  return `S${target.setNumber}: ${parts.join(' · ')}`;
}

export function formatWeekOverridesInput(
  overrides?: ExerciseWeekOverride[] | null,
): string {
  if (!overrides?.length) {
    return '';
  }

  return [...overrides]
    .sort((a, b) => a.week - b.week)
    .map((override) => {
      const fields = [
        override.sets != null ? `sets=${override.sets}` : null,
        override.reps ? `reps=${override.reps}` : null,
        override.restSeconds != null ? `rest=${override.restSeconds}` : null,
        override.rir ? `rir=${formatRirInput(override.rir)}` : null,
        override.notes ? `notes=${override.notes}` : null,
      ].filter((item): item is string => item != null);

      return `W${override.week}: ${fields.join('; ')}`;
    })
    .join('\n');
}

export function formatWeekOverrideSummary(
  override: ExerciseWeekOverride,
): string {
  const parts = [
    override.sets != null ? `${override.sets}x` : null,
    override.reps ?? null,
    override.restSeconds != null ? `Rest ${override.restSeconds}s` : null,
    override.rir ? `RIR ${formatRirInput(override.rir)}` : null,
    override.notes ?? null,
  ].filter((item): item is string => item != null && item.length > 0);

  return `W${override.week}: ${parts.join(' · ')}`;
}

export function hasAdvancedExerciseEditorFields(
  exercise?: Exercise | null,
): boolean {
  if (!exercise) {
    return false;
  }

  return (
    exercise.advanced?.restSeconds != null ||
    !!exercise.advanced?.rir?.label ||
    !!exercise.advanced?.intensity?.label ||
    !!exercise.advanced?.tempo ||
    !!exercise.advanced?.progressionRule?.label ||
    !!exercise.advanced?.unilateral?.label ||
    !!exercise.advanced?.equipment ||
    !!exercise.advanced?.primaryMuscles?.length ||
    !!exercise.advanced?.secondaryMuscles?.length ||
    !!exercise.advanced?.technicalNotes?.length ||
    !!exercise.advanced?.executionCues?.length ||
    !!exercise.advanced?.perSetTargets?.length ||
    !!exercise.advanced?.weekOverrides?.length ||
    !!exercise.canonicalExerciseId ||
    !!exercise.aliases?.length ||
    !!exercise.variantLabel ||
    exercise.sessionSpecific === true
  );
}
