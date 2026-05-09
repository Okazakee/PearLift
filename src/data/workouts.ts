import type {
  DayConfig,
  UserWeights,
  WeekConfig,
  WorkoutSession,
} from '@/types';

export const defaultWeekConfigs: WeekConfig[] = [
  { id: 1, name: 'Week 1', loadModifier: 1, rir: 2 },
  { id: 2, name: 'Week 2', loadModifier: 1, rir: 2 },
  { id: 3, name: 'Week 3', loadModifier: 1, rir: 2 },
  { id: 4, name: 'Week 4', loadModifier: 1, rir: 2 },
];

export const defaultDayConfigs: DayConfig[] = [
  { id: 'day1', name: 'Day 1', icon: 'Activity' },
  { id: 'day2', name: 'Day 2', icon: 'Repeat' },
  { id: 'day3', name: 'Day 3', icon: 'Navigation' },
  { id: 'day4', name: 'Day 4', icon: 'RefreshCw' },
];

export const dayIconMap: Record<string, string> = {
  Activity: 'Activity',
  Repeat: 'Repeat',
  Navigation: 'Navigation',
  RefreshCw: 'RefreshCw',
  Clock: 'Clock',
  Heart: 'Heart',
  Star: 'Star',
  Dumbbell: 'Dumbbell',
  Flame: 'Flame',
  Settings: 'Settings',
};

export const dayIconOptions = [
  'Activity',
  'Repeat',
  'Navigation',
  'RefreshCw',
  'Clock',
  'Heart',
  'Star',
  'Dumbbell',
  'Flame',
];

export const muscleGroups = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Legs',
  'Quads',
  'Hamstrings',
  'Calves',
  'Core',
  'Full Body',
];

export const defaultWorkouts: WorkoutSession[] = [
  {
    id: 'day1',
    name: 'Day 1',
    description: 'Build strength with compound movements',
    exercises: [
      {
        id: 'exercise-1-1',
        name: 'Bench Press',
        sets: 3,
        reps: '8',
        baseWeight: 0,
        muscleGroup: 'Chest',
        notes: '',
        position: 0,
      },
      {
        id: 'exercise-1-2',
        name: 'Squat',
        sets: 3,
        reps: '8',
        baseWeight: 0,
        muscleGroup: 'Legs',
        notes: '',
        position: 1,
      },
      {
        id: 'exercise-1-3',
        name: 'Deadlift',
        sets: 3,
        reps: '5',
        baseWeight: 0,
        muscleGroup: 'Back',
        notes: '',
        position: 2,
      },
    ],
  },
  {
    id: 'day2',
    name: 'Day 2',
    description: 'Push focus - chest and shoulders',
    exercises: [
      {
        id: 'exercise-2-1',
        name: 'Overhead Press',
        sets: 3,
        reps: '8',
        baseWeight: 0,
        muscleGroup: 'Shoulders',
        notes: '',
        position: 0,
      },
      {
        id: 'exercise-2-2',
        name: 'Incline Dumbbell Press',
        sets: 3,
        reps: '10',
        baseWeight: 0,
        muscleGroup: 'Chest',
        notes: '',
        position: 1,
      },
      {
        id: 'exercise-2-3',
        name: 'Tricep Pushdown',
        sets: 3,
        reps: '12',
        baseWeight: 0,
        muscleGroup: 'Triceps',
        notes: '',
        position: 2,
      },
    ],
  },
  {
    id: 'day3',
    name: 'Day 3',
    description: 'Pull focus - back and biceps',
    exercises: [
      {
        id: 'exercise-3-1',
        name: 'Barbell Row',
        sets: 3,
        reps: '8',
        baseWeight: 0,
        muscleGroup: 'Back',
        notes: '',
        position: 0,
      },
      {
        id: 'exercise-3-2',
        name: 'Lat Pulldown',
        sets: 3,
        reps: '10',
        baseWeight: 0,
        muscleGroup: 'Back',
        notes: '',
        position: 1,
      },
      {
        id: 'exercise-3-3',
        name: 'Barbell Curl',
        sets: 3,
        reps: '12',
        baseWeight: 0,
        muscleGroup: 'Biceps',
        notes: '',
        position: 2,
      },
    ],
  },
  {
    id: 'day4',
    name: 'Day 4',
    description: 'Legs and core',
    exercises: [
      {
        id: 'exercise-4-1',
        name: 'Leg Press',
        sets: 3,
        reps: '10',
        baseWeight: 0,
        muscleGroup: 'Legs',
        notes: '',
        position: 0,
      },
      {
        id: 'exercise-4-2',
        name: 'Romanian Deadlift',
        sets: 3,
        reps: '10',
        baseWeight: 0,
        muscleGroup: 'Hamstrings',
        notes: '',
        position: 1,
      },
      {
        id: 'exercise-4-3',
        name: 'Plank',
        sets: 3,
        reps: '60s',
        baseWeight: 0,
        muscleGroup: 'Core',
        notes: 'Hold seconds',
        position: 2,
      },
    ],
  },
];

export function buildInitialWeights(workouts: WorkoutSession[]): UserWeights {
  const weights: UserWeights = {};
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      weights[exercise.id] = exercise.baseWeight;
    }
  }
  return weights;
}
