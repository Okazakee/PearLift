import { useMemo } from 'react';
import type { ThemeMode, ThemePreference } from '../theme/tokens';
import { getThemeTokens, resolveThemeMode } from '../theme/tokens';
import type { WorkoutDay, WorkoutSession } from '../types';

export function useThemeTokens(args: {
  themePreference: ThemePreference;
  systemScheme: ThemeMode | null;
}) {
  const { themePreference, systemScheme } = args;
  const effectiveThemeMode = resolveThemeMode(themePreference, systemScheme);
  const tokens = useMemo(
    () => getThemeTokens(effectiveThemeMode, { enableDynamicColor: false }),
    [effectiveThemeMode],
  );
  return { tokens, effectiveThemeMode };
}

export function useLayout(args: { bottomInset: number; spacingSm: number }) {
  const { bottomInset, spacingSm } = args;
  const layout = useMemo(() => {
    const navBottomPadding = Math.max(bottomInset, 8) + spacingSm;
    const navHeight = 64 + navBottomPadding;
    const floatingBottom = navHeight + 8;
    return {
      navBottomPadding,
      navHeight,
      timerFabBottom: floatingBottom + 8,
      timerPanelBottom: floatingBottom,
      workoutFabBottom: floatingBottom + 8,
      contentBottomPadding: floatingBottom + 96,
    };
  }, [bottomInset, spacingSm]);
  return layout;
}

export function useCurrentWorkout(args: {
  workouts: WorkoutSession[];
  currentDay: WorkoutDay;
}) {
  const { workouts, currentDay } = args;
  const currentWorkout = useMemo(() => {
    return (
      workouts.find((workout) => workout.id === currentDay) ??
      workouts[0] ?? {
        id: 'push',
        name: 'Workout',
        description: '',
        exercises: [],
      }
    );
  }, [workouts, currentDay]);
  return currentWorkout;
}

export function useExerciseBaseWeights(args: { workouts: WorkoutSession[] }) {
  const { workouts } = args;
  const exerciseBaseWeights = useMemo(() => {
    const map = new Map<string, number>();
    for (const workout of workouts) {
      for (const exercise of workout.exercises) {
        map.set(exercise.id, exercise.baseWeight);
      }
    }
    return map;
  }, [workouts]);
  return exerciseBaseWeights;
}
