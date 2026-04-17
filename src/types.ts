export type WorkoutDay = string;
export type WeekPhase = number;

export interface WeekConfig {
  id: number;
  name: string;
  loadModifier: number;
  rir: number;
}

export interface DayConfig {
  id: string;
  name: string;
  icon: string;
}

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  baseWeight: number;
  muscleGroup: string;
  notes: string;
  position: number;
}

export interface WorkoutSession {
  id: string;
  name: string;
  description: string;
  exercises: Exercise[];
}

export type UserWeights = Record<string, number>;
