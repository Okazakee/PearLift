import type { NavigationBarStyle } from 'expo-navigation-bar';
import type { StatusBarStyle } from 'expo-status-bar';
import { useMemo } from 'react';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { defaultDayConfigs } from '@/data/workouts';
import type { WorkoutStoreSnapshot } from '@/storage/types';
import { summarizeRuntime } from '@/sync/firstSync';
import type { ThemePreference } from '@/theme/tokens';
import {
  getThemeTokens,
  resolveThemeMode,
  type ThemeMode,
} from '@/theme/tokens';
import type { WeightUnit } from '@/types';
import { roundToHalf } from '@/utils/math';
import {
  fromDisplayWeight,
  roundToIncrement,
  toDisplayWeight,
} from '@/utils/units';

interface ResponsiveLayout {
  isTablet: boolean;
  contentMaxWidth: number;
  exerciseColumns: number;
}

export function useWorkoutDerivedState(input: {
  snapshot: WorkoutStoreSnapshot | null;
  insets: EdgeInsets;
  responsiveLayout: ResponsiveLayout;
  systemThemeMode: ThemeMode | null;
}) {
  const { snapshot, insets, responsiveLayout, systemThemeMode } = input;
  const themePreference: ThemePreference = snapshot?.themeMode ?? 'system';
  const effectiveThemeMode = resolveThemeMode(themePreference, systemThemeMode);
  const tokens = useMemo(
    () => getThemeTokens(effectiveThemeMode, { enableDynamicColor: false }),
    [effectiveThemeMode],
  );
  const statusBarStyle: StatusBarStyle =
    effectiveThemeMode === 'dark' ? 'light' : 'dark';
  const navigationBarStyle: NavigationBarStyle =
    effectiveThemeMode === 'dark' ? 'dark' : 'light';

  const currentWeek = snapshot?.currentWeek ?? 1;
  const workouts = snapshot?.workouts ?? [];
  const userWeights = snapshot?.userWeights ?? {};
  const weekConfigs = snapshot?.weekConfigs ?? [];
  const dayConfigs = snapshot?.dayConfigs ?? defaultDayConfigs;
  const rawSelectedDay =
    snapshot?.currentDay ??
    dayConfigs[0]?.id ??
    defaultDayConfigs[0]?.id ??
    'push';
  const selectedDay = dayConfigs.some((day) => day.id === rawSelectedDay)
    ? rawSelectedDay
    : (dayConfigs[0]?.id ?? rawSelectedDay);
  const restDuration = snapshot?.restDuration ?? 150;
  const weightUnit: WeightUnit = snapshot?.weightUnit ?? 'kg';
  const currentLanguage = snapshot?.language ?? 'system';

  const exerciseBaseWeights = useMemo(() => {
    const map = new Map<string, number>();
    for (const workout of workouts) {
      for (const exercise of workout.exercises) {
        map.set(exercise.id, exercise.baseWeight);
      }
    }
    return map;
  }, [workouts]);

  const layout = useMemo(() => {
    const navBottomPadding =
      Math.max(insets.bottom, responsiveLayout.isTablet ? 4 : 8) +
      (responsiveLayout.isTablet ? 4 : tokens.spacing.sm);
    const navHeight = (responsiveLayout.isTablet ? 54 : 64) + navBottomPadding;
    const floatingBottom = navHeight + 8;
    return {
      navBottomPadding,
      navHeight,
      timerFabBottom: floatingBottom + 8,
      timerPanelBottom: floatingBottom,
      workoutFabBottom: floatingBottom + 8,
      contentBottomPadding: floatingBottom + 96,
    };
  }, [insets.bottom, responsiveLayout.isTablet, tokens.spacing.sm]);

  const currentWorkout = useMemo(() => {
    const match = workouts.find((workout) => workout.id === selectedDay);
    if (match) return match;
    const fallbackName =
      dayConfigs.find((day) => day.id === selectedDay)?.name ?? 'Workout';
    return {
      id: selectedDay,
      name: fallbackName,
      description: '',
      exercises: [],
    };
  }, [workouts, selectedDay, dayConfigs]);

  const localSyncSummary = useMemo(() => {
    if (!snapshot) return null;
    return summarizeRuntime(snapshot);
  }, [snapshot]);

  const workoutNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const workout of workouts) {
      map[workout.id] = workout.name;
    }
    return map;
  }, [workouts]);

  const exerciseNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const workout of workouts) {
      for (const exercise of workout.exercises) {
        map[exercise.id] = exercise.name;
      }
    }
    return map;
  }, [workouts]);

  function getAdjustedWeight(exerciseId: string, weekId?: number) {
    const week =
      weekConfigs.find((item) => item.id === (weekId ?? currentWeek)) ??
      weekConfigs[0];
    const fallback = exerciseBaseWeights.get(exerciseId) ?? 0;
    const baseWeight = userWeights[exerciseId] ?? fallback;
    const rawKg = baseWeight * (week?.loadModifier ?? 1);
    if (weightUnit === 'lb') {
      const rawLb = toDisplayWeight(rawKg, 'lb');
      const roundedLb = roundToIncrement(rawLb, 2.5);
      return fromDisplayWeight(roundedLb, 'lb');
    }
    return roundToHalf(rawKg);
  }

  return {
    tokens,
    themePreference,
    effectiveThemeMode,
    statusBarStyle,
    navigationBarStyle,
    currentWeek,
    workouts,
    userWeights,
    weekConfigs,
    dayConfigs,
    selectedDay,
    restDuration,
    weightUnit,
    currentLanguage,
    layout,
    currentWorkout,
    localSyncSummary,
    workoutNameMap,
    exerciseNameMap,
    onboardingBlocking: snapshot?.isSetupDone === false,
    getAdjustedWeight,
  };
}
