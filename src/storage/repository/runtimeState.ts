import type { Exercise, UserWeights } from '@/types';

export type ProgramDayRow = {
  id: string;
  day_label: string;
  icon: string;
  workout_name: string;
  workout_description: string;
  sort_order: number;
};

export type ExerciseRow = {
  id: string;
  program_day_id: string;
  name: string;
  muscle_group: string;
  notes: string;
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

export type WeekConfigRow = {
  id: number;
  name: string;
  load_modifier: number;
  rir: number;
  sort_order: number;
};

export type AppSettingRow = {
  key: string;
  value: string;
};

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
    const list = exerciseMap.get(exercise.program_day_id) ?? [];
    list.push({
      id: exercise.id,
      name: exercise.name,
      sets: target?.sets ?? 2,
      reps: target?.reps ?? '8-10',
      baseWeight: target?.base_weight ?? 0,
      muscleGroup: exercise.muscle_group,
      notes: exercise.notes,
      position: exercise.sort_order,
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

export function toSettingsMap(settings: AppSettingRow[]): Map<string, string> {
  return new Map(settings.map((entry) => [entry.key, entry.value]));
}
