import { useCallback, useEffect, useState } from 'react';
import { roundToPrecision } from '../utils/math';
import type { WorkoutMutation, WorkoutStoreSnapshot } from './types';
import type { WorkoutRepository } from './workoutRepository';

interface UseWorkoutStoreResult {
  snapshot: WorkoutStoreSnapshot | null;
  isReady: boolean;
  reload: () => Promise<void>;
  applyMutation: (mutation: WorkoutMutation) => Promise<void>;
}

function shouldSkipSnapshotReload(mutation: WorkoutMutation) {
  return (
    mutation.type === 'setThemeMode' ||
    mutation.type === 'setCurrentWeek' ||
    mutation.type === 'setCurrentDay' ||
    mutation.type === 'setRestDuration' ||
    mutation.type === 'setWeightUnit' ||
    mutation.type === 'setExerciseWeight' ||
    mutation.type === 'adjustExerciseWeight' ||
    mutation.type === 'editExercise' ||
    mutation.type === 'deleteExercise' ||
    mutation.type === 'reorderExercises' ||
    mutation.type === 'replaceWeekConfigs' ||
    mutation.type === 'replaceDayConfigs'
  );
}

function getFallbackBaseWeight(
  snapshot: WorkoutStoreSnapshot,
  exerciseId: string,
) {
  for (const workout of snapshot.workouts) {
    for (const exercise of workout.exercises) {
      if (exercise.id === exerciseId) {
        return exercise.baseWeight;
      }
    }
  }
  return 0;
}

function applyOptimisticMutation(
  snapshot: WorkoutStoreSnapshot,
  mutation: WorkoutMutation,
): WorkoutStoreSnapshot {
  switch (mutation.type) {
    case 'setThemeMode':
      return { ...snapshot, themeMode: mutation.themeMode };
    case 'setCurrentWeek':
      return { ...snapshot, currentWeek: Math.max(1, mutation.currentWeek) };
    case 'setCurrentDay':
      return { ...snapshot, currentDay: mutation.currentDay };
    case 'setRestDuration':
      return { ...snapshot, restDuration: Math.max(0, mutation.restDuration) };
    case 'setWeightUnit':
      return { ...snapshot, weightUnit: mutation.weightUnit };
    case 'setExerciseWeight':
      return {
        ...snapshot,
        userWeights: {
          ...snapshot.userWeights,
          [mutation.exerciseId]: Math.max(
            0,
            roundToPrecision(mutation.value, 3),
          ),
        },
      };
    case 'adjustExerciseWeight': {
      const current =
        snapshot.userWeights[mutation.exerciseId] ??
        getFallbackBaseWeight(snapshot, mutation.exerciseId);
      const next = Math.max(0, roundToPrecision(current + mutation.delta, 3));
      return {
        ...snapshot,
        userWeights: {
          ...snapshot.userWeights,
          [mutation.exerciseId]: next,
        },
      };
    }
    case 'editExercise': {
      return {
        ...snapshot,
        workouts: snapshot.workouts.map((workout) =>
          workout.id !== mutation.workoutId
            ? workout
            : {
                ...workout,
                exercises: workout.exercises.map((exercise) =>
                  exercise.id !== mutation.exerciseId
                    ? exercise
                    : {
                        ...exercise,
                        ...mutation.updates,
                      },
                ),
              },
        ),
      };
    }
    case 'deleteExercise': {
      const nextWorkouts = snapshot.workouts.map((workout) => {
        if (workout.id !== mutation.workoutId) {
          return workout;
        }
        const remaining = workout.exercises
          .filter((exercise) => exercise.id !== mutation.exerciseId)
          .map((exercise, index) => ({
            ...exercise,
            position: index,
          }));
        return {
          ...workout,
          exercises: remaining,
        };
      });
      const { [mutation.exerciseId]: _removed, ...remainingWeights } =
        snapshot.userWeights;
      return {
        ...snapshot,
        workouts: nextWorkouts,
        userWeights: remainingWeights,
      };
    }
    case 'reorderExercises': {
      return {
        ...snapshot,
        workouts: snapshot.workouts.map((workout) => {
          if (workout.id !== mutation.workoutId) {
            return workout;
          }
          const existing = [...workout.exercises].sort(
            (a, b) => a.position - b.position,
          );
          const byId = new Map(
            existing.map((exercise) => [exercise.id, exercise]),
          );
          const next: typeof existing = [];
          for (const id of mutation.orderedExerciseIds) {
            const exercise = byId.get(id);
            if (exercise) {
              next.push(exercise);
              byId.delete(id);
            }
          }
          for (const exercise of existing) {
            if (byId.has(exercise.id)) {
              next.push(exercise);
              byId.delete(exercise.id);
            }
          }
          return {
            ...workout,
            exercises: next.map((exercise, index) => ({
              ...exercise,
              position: index,
            })),
          };
        }),
      };
    }
    case 'replaceWeekConfigs':
      return {
        ...snapshot,
        weekConfigs: mutation.weekConfigs.map((week, index) => ({
          ...week,
          id: index + 1,
        })),
      };
    case 'replaceDayConfigs': {
      const nextDayConfigs = mutation.dayConfigs;
      const workoutById = new Map(
        snapshot.workouts.map((workout) => [workout.id, workout]),
      );
      const alignedWorkouts = nextDayConfigs.map((day, index) => {
        const existing = workoutById.get(day.id);
        if (existing) {
          return existing;
        }
        return {
          id: day.id,
          name: `${day.name} Day`,
          description: `Custom session ${index + 1}`,
          exercises: [],
        };
      });
      for (const workout of snapshot.workouts) {
        if (!nextDayConfigs.some((day) => day.id === workout.id)) {
          alignedWorkouts.push(workout);
        }
      }
      const currentDayStillExists = nextDayConfigs.some(
        (day) => day.id === snapshot.currentDay,
      );
      return {
        ...snapshot,
        dayConfigs: nextDayConfigs,
        workouts: alignedWorkouts,
        currentDay: currentDayStillExists
          ? snapshot.currentDay
          : (nextDayConfigs[0]?.id ?? snapshot.currentDay),
      };
    }
    default:
      return snapshot;
  }
}

export function useWorkoutStore(
  repository: WorkoutRepository | null,
): UseWorkoutStoreResult {
  const [snapshot, setSnapshot] = useState<WorkoutStoreSnapshot | null>(null);
  const [isReady, setIsReady] = useState(false);

  const reload = useCallback(async () => {
    if (!repository) {
      return;
    }
    const next = await repository.getSnapshot();
    setSnapshot(next);
  }, [repository]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!repository) {
        return;
      }
      setIsReady(false);
      await repository.initialize();
      const next = await repository.getSnapshot();
      if (cancelled) {
        return;
      }
      setSnapshot(next);
      setIsReady(true);
    }

    hydrate().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[workout-store/hydrate failed]', error);
    });

    return () => {
      cancelled = true;
    };
  }, [repository]);

  const applyMutation = useCallback(
    async (mutation: WorkoutMutation) => {
      if (!repository) {
        return;
      }
      const skipSnapshotReload = shouldSkipSnapshotReload(mutation);
      if (skipSnapshotReload) {
        setSnapshot((current) =>
          current ? applyOptimisticMutation(current, mutation) : current,
        );
      }

      try {
        await repository.applyMutation(mutation);
        if (!skipSnapshotReload) {
          const next = await repository.getSnapshot();
          setSnapshot(next);
        }
      } catch (error) {
        if (skipSnapshotReload) {
          try {
            const next = await repository.getSnapshot();
            setSnapshot(next);
          } catch {
            // ignore snapshot recovery failures; caller handles original error
          }
        }
        throw error;
      }
    },
    [repository],
  );

  return {
    snapshot,
    isReady,
    reload,
    applyMutation,
  };
}
