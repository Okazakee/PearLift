import type {
  DayConfig,
  UserWeights,
  WeekConfig,
  WorkoutSession,
} from '../types';

export const defaultWeekConfigs: WeekConfig[] = [
  { id: 1, name: 'Tolerance', loadModifier: 1, rir: 2 },
  { id: 2, name: 'Accumulation', loadModifier: 1.05, rir: 2 },
  { id: 3, name: 'Peak', loadModifier: 1.05, rir: 1 },
  { id: 4, name: 'Deload', loadModifier: 0.8, rir: 3 },
];

export const defaultDayConfigs: DayConfig[] = [
  { id: 'push', name: 'Push', icon: 'FitnessCenter' },
  { id: 'pull', name: 'Pull', icon: 'SwapHoriz' },
  { id: 'legs', name: 'Legs', icon: 'DirectionsWalk' },
  { id: 'recall', name: 'Recall', icon: 'Replay' },
];

export const dayIconMap: Record<string, string> = {
  FitnessCenter: 'fitness-center',
  SwapHoriz: 'swap-horiz',
  DirectionsWalk: 'directions-walk',
  Replay: 'replay',
  Timer: 'timer',
  Favorite: 'favorite',
  Star: 'star',
  Settings: 'settings',
};

export const dayIconOptions = Object.keys(dayIconMap);

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
    id: 'push',
    name: 'Push Day',
    description: 'Chest, Shoulders & Triceps',
    exercises: [
      {
        id: 'multipower-press',
        name: 'MultiPower Press 30°',
        sets: 2,
        reps: '6-8',
        baseWeight: 0,
        muscleGroup: 'Chest',
        notes: 'Incline angle for upper chest emphasis',
        position: 0,
      },
      {
        id: 'shoulder-press-db',
        name: 'Shoulder Press (DB)',
        sets: 2,
        reps: '6-8',
        baseWeight: 0,
        muscleGroup: 'Shoulders',
        notes: '',
        position: 1,
      },
      {
        id: 'chest-press-close',
        name: 'Chest Press Close',
        sets: 2,
        reps: '8-10',
        baseWeight: 0,
        muscleGroup: 'Chest',
        notes: '',
        position: 2,
      },
      {
        id: 'pushdown-bar',
        name: 'Push Down Cable',
        sets: 2,
        reps: '10-12',
        baseWeight: 0,
        muscleGroup: 'Triceps',
        notes: '',
        position: 3,
      },
      {
        id: 'dannunzio-crunch-push',
        name: "D'annunzio Crunch",
        sets: 2,
        reps: '12-15',
        baseWeight: 0,
        muscleGroup: 'Core',
        notes: '',
        position: 4,
      },
    ],
  },
  {
    id: 'pull',
    name: 'Pull Day',
    description: 'Back & Biceps',
    exercises: [
      {
        id: 'tbar-row',
        name: 'T-Bar Row',
        sets: 2,
        reps: '6-8',
        baseWeight: 0,
        muscleGroup: 'Back',
        notes: '',
        position: 0,
      },
      {
        id: 'low-pulley-row',
        name: 'Low Pulley Row',
        sets: 2,
        reps: '8-10',
        baseWeight: 0,
        muscleGroup: 'Back',
        notes: '',
        position: 1,
      },
      {
        id: 'incline-curl',
        name: 'Incline Dumbbell Curl',
        sets: 2,
        reps: '8-10',
        baseWeight: 0,
        muscleGroup: 'Biceps',
        notes: '',
        position: 2,
      },
      {
        id: 'alternating-curl-pull',
        name: 'Alternating Curl',
        sets: 2,
        reps: '10-12',
        baseWeight: 0,
        muscleGroup: 'Biceps',
        notes: '',
        position: 3,
      },
      {
        id: 'cable-crunch',
        name: 'Cable Crunch',
        sets: 2,
        reps: '12-15',
        baseWeight: 0,
        muscleGroup: 'Core',
        notes: '',
        position: 4,
      },
    ],
  },
  {
    id: 'legs',
    name: 'Leg Day',
    description: 'Quads, Hamstrings & Calves',
    exercises: [
      {
        id: 'leg-press',
        name: 'Leg Press 45°',
        sets: 2,
        reps: '6-8',
        baseWeight: 0,
        muscleGroup: 'Legs',
        notes: '',
        position: 0,
      },
      {
        id: 'leg-extension',
        name: 'Leg Extension',
        sets: 2,
        reps: '10-12',
        baseWeight: 0,
        muscleGroup: 'Quads',
        notes: '',
        position: 1,
      },
      {
        id: 'lying-leg-curl',
        name: 'Lying Leg Curl',
        sets: 2,
        reps: '10-12',
        baseWeight: 0,
        muscleGroup: 'Hamstrings',
        notes: '',
        position: 2,
      },
      {
        id: 'standing-calf',
        name: 'Standing Calf Raise',
        sets: 2,
        reps: '12-15',
        baseWeight: 0,
        muscleGroup: 'Calves',
        notes: '',
        position: 3,
      },
      {
        id: 'side-crunch',
        name: 'Side Crunch',
        sets: 2,
        reps: '12-15',
        baseWeight: 0,
        muscleGroup: 'Core',
        notes: '',
        position: 4,
      },
    ],
  },
  {
    id: 'recall',
    name: 'Recall Day',
    description: 'Supplementary Full Body',
    exercises: [
      {
        id: 'incline-chest-press',
        name: 'Incline Chest Press',
        sets: 2,
        reps: '6-8',
        baseWeight: 0,
        muscleGroup: 'Chest',
        notes: '',
        position: 0,
      },
      {
        id: 'lat-machine',
        name: 'Lat Machine',
        sets: 2,
        reps: '8-10',
        baseWeight: 0,
        muscleGroup: 'Back',
        notes: '',
        position: 1,
      },
      {
        id: 'alternating-curl-recall',
        name: 'Alternating Curl',
        sets: 2,
        reps: '10-12',
        baseWeight: 0,
        muscleGroup: 'Biceps',
        notes: '',
        position: 2,
      },
      {
        id: 'pushdown-rope',
        name: 'Push Down Rope',
        sets: 2,
        reps: '10-12',
        baseWeight: 0,
        muscleGroup: 'Triceps',
        notes: '',
        position: 3,
      },
      {
        id: 'dannunzio-crunch-recall',
        name: "D'annunzio Crunch",
        sets: 2,
        reps: '12-15',
        baseWeight: 0,
        muscleGroup: 'Core',
        notes: '',
        position: 4,
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
