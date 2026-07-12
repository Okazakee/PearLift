import {
  normalizeExerciseAdvanced,
  normalizeTrainingProgram,
  normalizeWorkoutSchedule,
} from '@/backup/normalization';
import type {
  Exercise,
  TrainingProgram,
  TrainingProgramSource,
  UserExerciseSettingsMap,
  UserWeights,
} from '@/types';

export type ProgramRow = {
  id: string;
  name: string;
  subtitle: string | null;
  goal: string | null;
  description: string;
  source_json: string | null;
  start_date: string | null;
  duration_weeks: number | null;
  schedule_type: string | null;
  progression_model: string | null;
  frequency_summary_json: string | null;
  default_rest_seconds: number | null;
  updated_at: string;
};

function parseProgramSourceJson(
  value: string | null,
): TrainingProgramSource | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      (parsed.type !== 'manual' &&
        parsed.type !== 'imported_pdf' &&
        parsed.type !== 'imported_json' &&
        parsed.type !== 'coach' &&
        parsed.type !== 'template')
    ) {
      return undefined;
    }

    return {
      type: parsed.type,
      ...(typeof parsed.label === 'string' && parsed.label.trim().length > 0
        ? { label: parsed.label.trim() }
        : {}),
      ...(typeof parsed.importedAt === 'string' &&
      parsed.importedAt.trim().length > 0
        ? { importedAt: parsed.importedAt }
        : {}),
    };
  } catch {
    return undefined;
  }
}

export type ProgramDayRow = {
  id: string;
  day_label: string;
  session_label: string | null;
  icon: string;
  schedule_json: string | null;
  workout_name: string;
  workout_description: string;
  default_rest_seconds: number | null;
  sort_order: number;
};

export type ExerciseRow = {
  id: string;
  program_day_id: string;
  canonical_exercise_id: string | null;
  name: string;
  aliases_json: string | null;
  variant_label: string | null;
  session_specific: number | null;
  muscle_group: string;
  notes: string;
  advanced_json: string | null;
  sort_order: number;
};

export type ExerciseTargetRow = {
  exercise_id: string;
  sets: number;
  reps: string;
  base_weight: number;
};

export type WeightRow = {
  exercise_id: string;
  value: number;
};

export type UserExerciseSettingsRow = {
  exercise_id: string;
  working_weight: number | null;
  weight_unit: string;
  weight_mode: string;
  increment_kg: number | null;
  estimated_one_rep_max: number | null;
  notes: string | null;
  updated_at: string;
};

export type WeekConfigRow = {
  week_number: number;
  name: string;
  load_modifier: number;
  volume_modifier: number | null;
  rir: number;
  notes: string | null;
  sort_order: number;
};

export type AppSettingRow = {
  key: string;
  value: string;
};

function parseExerciseAdvancedJson(value: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    return normalizeExerciseAdvanced(JSON.parse(value));
  } catch {
    // ignore malformed advanced exercise payloads
    return undefined;
  }
}

function parseAliasesJson(value: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    const aliases = parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
    return aliases.length > 0 ? aliases : undefined;
  } catch {
    // ignore malformed exercise aliases payloads
    return undefined;
  }
}

function parseScheduleJson(value: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    return normalizeWorkoutSchedule(JSON.parse(value));
  } catch {
    // ignore malformed stored schedule payloads
    return undefined;
  }
}

export function buildExerciseMap(
  exercises: ExerciseRow[],
  targets: ExerciseTargetRow[],
): Map<string, Exercise[]> {
  const targetMap = new Map(
    targets.map((target) => [target.exercise_id, target]),
  );
  const exerciseMap = new Map<string, Exercise[]>();

  for (const exercise of exercises) {
    const target = targetMap.get(exercise.id);
    const aliases = parseAliasesJson(exercise.aliases_json);
    const list = exerciseMap.get(exercise.program_day_id) ?? [];
    list.push({
      id: exercise.id,
      ...(exercise.canonical_exercise_id
        ? { canonicalExerciseId: exercise.canonical_exercise_id }
        : {}),
      name: exercise.name,
      ...(aliases ? { aliases } : {}),
      ...(exercise.variant_label
        ? { variantLabel: exercise.variant_label }
        : {}),
      ...(exercise.session_specific ? { sessionSpecific: true } : {}),
      sets: target?.sets ?? 2,
      reps: target?.reps ?? '8-10',
      baseWeight: target?.base_weight ?? 0,
      muscleGroup: exercise.muscle_group,
      notes: exercise.notes,
      position: exercise.sort_order,
      advanced: parseExerciseAdvancedJson(exercise.advanced_json),
    });
    exerciseMap.set(exercise.program_day_id, list);
  }

  return exerciseMap;
}

export function buildUserWeights(weights: WeightRow[]): UserWeights {
  const userWeights: UserWeights = {};
  for (const row of weights) {
    userWeights[row.exercise_id] = row.value;
  }
  return userWeights;
}

export function buildUserExerciseSettings(
  rows: UserExerciseSettingsRow[],
): UserExerciseSettingsMap {
  const result: UserExerciseSettingsMap = {};

  for (const row of rows) {
    result[row.exercise_id] = {
      exerciseId: row.exercise_id,
      ...(row.working_weight != null
        ? { workingWeight: row.working_weight }
        : {}),
      weightUnit: row.weight_unit === 'lb' ? 'lb' : 'kg',
      weightMode:
        row.weight_mode === 'per_hand' ||
        row.weight_mode === 'per_side' ||
        row.weight_mode === 'machine_stack' ||
        row.weight_mode === 'bodyweight' ||
        row.weight_mode === 'assisted' ||
        row.weight_mode === 'custom'
          ? row.weight_mode
          : 'total',
      ...(row.increment_kg != null ? { incrementKg: row.increment_kg } : {}),
      ...(row.estimated_one_rep_max != null
        ? { estimatedOneRepMax: row.estimated_one_rep_max }
        : {}),
      ...(row.notes ? { notes: row.notes } : {}),
      updatedAt: row.updated_at,
    };
  }

  return result;
}

export function buildTrainingProgram(
  program: ProgramRow | null,
  workoutIds: string[],
): TrainingProgram | null {
  if (!program) {
    return null;
  }

  try {
    return normalizeTrainingProgram(
      {
        id: program.id,
        name: program.name,
        subtitle: program.subtitle,
        goal: program.goal,
        description: program.description,
        source: parseProgramSourceJson(program.source_json),
        startDate: program.start_date,
        durationWeeks: program.duration_weeks,
        scheduleType: program.schedule_type,
        progressionModel: program.progression_model,
        frequencySummary: program.frequency_summary_json
          ? JSON.parse(program.frequency_summary_json)
          : undefined,
        defaultRestSeconds: program.default_rest_seconds,
        updatedAt: program.updated_at,
        workoutIds,
      },
      workoutIds.map((id) => ({
        id,
        name: id,
        description: '',
        exercises: [],
      })),
    );
  } catch {
    // ignore malformed stored program payloads
    return normalizeTrainingProgram(
      {
        id: program.id,
        name: program.name,
        subtitle: program.subtitle,
        goal: program.goal,
        description: program.description,
        source: parseProgramSourceJson(program.source_json),
        startDate: program.start_date,
        durationWeeks: program.duration_weeks,
        scheduleType: program.schedule_type,
        progressionModel: program.progression_model,
        defaultRestSeconds: program.default_rest_seconds,
        updatedAt: program.updated_at,
        workoutIds,
      },
      workoutIds.map((id) => ({
        id,
        name: id,
        description: '',
        exercises: [],
      })),
    );
  }
}

export function buildDayConfigSchedule(value: string | null) {
  return parseScheduleJson(value);
}

export function toSettingsMap(settings: AppSettingRow[]): Map<string, string> {
  return new Map(settings.map((entry) => [entry.key, entry.value]));
}
