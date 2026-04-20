import { Plus, Sliders } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import type { SortableGridRenderItem } from 'react-native-sortables';
import Sortable from 'react-native-sortables';
import { AnimatedPressable } from '../animation/primitives';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';
import type {
  Exercise,
  UserWeights,
  WeekConfig,
  WeightUnit,
  WorkoutSession,
} from '../types';
import { arraysEqualBy } from '../utils/array';
import { scheduleIdleTask } from '../utils/idle';
import { ExerciseCard } from './ExerciseCard';

interface WorkoutViewProps {
  tokens: ThemeTokens;
  weightUnit: WeightUnit;
  contentBottomPadding: number;
  fabBottom: number;
  workout: WorkoutSession;
  currentWeek: number;
  weekConfigs: WeekConfig[];
  userWeights: UserWeights;
  getAdjustedWeight: (exerciseId: string, weekId?: number) => number;
  onWeekChange: (id: number) => void;
  onOpenProgramSettings: () => void;
  onOpenAddExercise: () => void;
  onEditExercise: (exercise: Exercise) => void;
  onDeleteExercise: (exercise: Exercise) => void;
  onAdjustWeight: (exerciseId: string, delta: number) => void;
  onSetWeight: (exerciseId: string, value: number) => void;
  onReorderExercises: (orderedExerciseIds: string[]) => void;
}

export function WorkoutView({
  tokens,
  weightUnit,
  contentBottomPadding,
  fabBottom: _fabBottom,
  workout,
  currentWeek,
  weekConfigs,
  userWeights,
  getAdjustedWeight,
  onWeekChange,
  onOpenProgramSettings,
  onOpenAddExercise,
  onEditExercise,
  onDeleteExercise,
  onAdjustWeight,
  onSetWeight,
  onReorderExercises,
}: WorkoutViewProps) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const pendingPersistCancelRef = useRef<(() => void) | null>(null);
  const pendingPersistOrderRef = useRef<string[] | null>(null);

  const styles = useMemo(
    () => createStyles(tokens, contentBottomPadding),
    [tokens, contentBottomPadding],
  );
  const week = weekConfigs.find((w) => w.id === currentWeek) ?? weekConfigs[0];
  const dayNumberMatch = workout.name.match(/\d+/);
  const dayLabel = dayNumberMatch ? `Day ${dayNumberMatch[0]}` : workout.name;
  const sortedExercises = useMemo(
    () => [...workout.exercises].sort((a, b) => a.position - b.position),
    [workout.exercises],
  );
  const exerciseById = useMemo(
    () => new Map(sortedExercises.map((exercise) => [exercise.id, exercise])),
    [sortedExercises],
  );
  const sortedExerciseIds = useMemo(
    () => sortedExercises.map((exercise) => exercise.id),
    [sortedExercises],
  );
  const activeWorkoutIdRef = useRef(workout.id);
  const [listExerciseIds, setListExerciseIds] =
    useState<string[]>(sortedExerciseIds);

  useEffect(
    () => () => {
      pendingPersistCancelRef.current?.();
      pendingPersistCancelRef.current = null;
    },
    [],
  );

  useEffect(() => {
    setListExerciseIds(sortedExerciseIds);
    pendingPersistOrderRef.current = null;
    activeWorkoutIdRef.current = workout.id;
  }, [sortedExerciseIds, workout.id]);

  useEffect(() => {
    const pendingOrder = pendingPersistOrderRef.current;
    if (
      pendingOrder &&
      arraysEqualBy(sortedExerciseIds, pendingOrder, (id) => id)
    ) {
      pendingPersistOrderRef.current = null;
      return;
    }

    if (pendingOrder) return;
    if (!arraysEqualBy(sortedExerciseIds, listExerciseIds, (id) => id)) {
      setListExerciseIds(sortedExerciseIds);
    }
  }, [listExerciseIds, sortedExerciseIds]);

  const renderHeader = useCallback(
    () => (
      <>
        <View style={styles.summaryCard}>
          <View style={styles.decorCircleA} />
          <View style={styles.decorCircleB} />
          <Text style={styles.metaText}>
            Week {currentWeek} - {dayLabel}
          </Text>
          <Text style={styles.workoutName}>
            {week?.name ?? `Week ${currentWeek}`}
          </Text>
          <View style={styles.badges}>
            <View style={styles.rirBadge}>
              <Text style={styles.rirBadgeLabel}>RIR {week?.rir ?? 2}</Text>
            </View>
            <View style={styles.loadBadge}>
              <Text style={styles.loadBadgeLabel}>
                {(week?.loadModifier ?? 1) === 1
                  ? 'Baseline'
                  : (week?.loadModifier ?? 1) < 1
                    ? `-${Math.round((1 - (week?.loadModifier ?? 1)) * 100)}%`
                    : `+${Math.round(((week?.loadModifier ?? 1) - 1) * 100)}%`}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.weekTabs}>
          <View style={styles.weekTabsInner}>
            {weekConfigs.map((item) => {
              const active = item.id === currentWeek;
              return (
                <AnimatedPressable
                  key={item.id}
                  style={[styles.weekTab, active && styles.weekTabActive]}
                  onPress={() => onWeekChange(item.id)}
                >
                  <Text
                    style={[
                      styles.weekTabText,
                      active && styles.weekTabTextActive,
                    ]}
                  >
                    W{item.id}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
          <AnimatedPressable
            style={styles.settingsButton}
            onPress={onOpenProgramSettings}
          >
            <Sliders size={16} color={tokens.colors.textSecondary} />
          </AnimatedPressable>
        </View>
      </>
    ),
    [
      currentWeek,
      dayLabel,
      onOpenProgramSettings,
      onWeekChange,
      styles,
      tokens.colors.textSecondary,
      week,
      weekConfigs,
    ],
  );

  const renderFooter = useCallback(
    () => (
      <AnimatedPressable style={styles.addButton} onPress={onOpenAddExercise}>
        <Plus size={16} color={tokens.colors.primary} />
        <Text style={styles.addButtonText}>Add Exercise</Text>
      </AnimatedPressable>
    ),
    [onOpenAddExercise, styles, tokens.colors.primary],
  );

  const displayExerciseIds =
    activeWorkoutIdRef.current === workout.id
      ? listExerciseIds
      : sortedExerciseIds;

  const renderItem = useCallback<SortableGridRenderItem<string>>(
    ({ item }) => {
      const exercise = exerciseById.get(item);
      if (!exercise) return null;
      return (
        <ExerciseCard
          tokens={tokens}
          exercise={exercise}
          weightUnit={weightUnit}
          baseWeight={userWeights[exercise.id] ?? exercise.baseWeight}
          adjustedWeight={getAdjustedWeight(exercise.id, currentWeek)}
          onAdjustWeight={onAdjustWeight}
          onSetWeight={onSetWeight}
          onEditExercise={onEditExercise}
          onDeleteExercise={onDeleteExercise}
        />
      );
    },
    [
      currentWeek,
      exerciseById,
      getAdjustedWeight,
      onAdjustWeight,
      onDeleteExercise,
      onEditExercise,
      onSetWeight,
      tokens,
      userWeights,
      weightUnit,
    ],
  );

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderHeader()}
        <Sortable.Grid
          data={displayExerciseIds}
          keyExtractor={(id) => id}
          renderItem={renderItem}
          columns={1}
          rowGap={tokens.spacing.md}
          scrollableRef={scrollRef}
          dragActivationDelay={300}
          activeItemScale={1.02}
          activeItemOpacity={0.95}
          activeItemShadowOpacity={0.12}
          dropAnimationDuration={200}
          onDragEnd={({ data: reordered }) => {
            setListExerciseIds(reordered);
            pendingPersistOrderRef.current = reordered;
            pendingPersistCancelRef.current?.();
            pendingPersistCancelRef.current = scheduleIdleTask(() => {
              pendingPersistCancelRef.current = null;
              onReorderExercises(reordered);
            });
          }}
        />
        {renderFooter()}
      </Animated.ScrollView>
    </View>
  );
}

function createStyles(tokens: ThemeTokens, contentBottomPadding: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: tokens.spacing.lg,
      paddingBottom: contentBottomPadding,
    },
    summaryCard: {
      marginBottom: tokens.spacing.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.primary, 0.2),
      borderRadius: tokens.radius.xl,
      padding: tokens.spacing.lg,
      backgroundColor: withAlpha(tokens.colors.primary, 0.08),
      gap: tokens.spacing.sm,
      overflow: 'hidden',
      position: 'relative',
    },
    decorCircleA: {
      position: 'absolute',
      top: -24,
      right: -24,
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: withAlpha(tokens.colors.primary, 0.12),
    },
    decorCircleB: {
      position: 'absolute',
      bottom: -16,
      left: -16,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: withAlpha(tokens.colors.secondary, 0.12),
    },
    workoutName: {
      color: tokens.colors.primary,
      fontFamily: 'SpaceGrotesk_700Bold',
      fontSize: tokens.type.subtitle,
      letterSpacing: 0.4,
      textAlign: 'center',
    },
    metaText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label - 1,
      fontFamily: 'SpaceGrotesk_600SemiBold',
      letterSpacing: 0.3,
      textAlign: 'center',
    },
    settingsButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: tokens.colors.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badges: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: tokens.spacing.sm,
    },
    rirBadge: {
      borderRadius: tokens.radius.pill,
      backgroundColor: withAlpha(tokens.colors.accentWarning, 0.16),
      paddingHorizontal: tokens.spacing.sm + 4,
      paddingVertical: tokens.spacing.xs + 1,
    },
    rirBadgeLabel: {
      color: tokens.colors.accentWarning,
      fontFamily: 'SpaceGrotesk_500Medium',
      fontSize: 12,
      letterSpacing: 0.3,
    },
    loadBadge: {
      borderRadius: tokens.radius.pill,
      backgroundColor: withAlpha(tokens.colors.success, 0.16),
      paddingHorizontal: tokens.spacing.sm + 4,
      paddingVertical: tokens.spacing.xs + 1,
    },
    loadBadgeLabel: {
      color: tokens.colors.success,
      fontFamily: 'SpaceGrotesk_600SemiBold',
      fontSize: 12,
      letterSpacing: 0.3,
    },
    weekTabs: {
      marginBottom: tokens.spacing.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: tokens.spacing.md,
    },
    weekTabsInner: {
      flexDirection: 'row',
      gap: tokens.spacing.xs,
      flex: 1,
      justifyContent: 'flex-start',
    },
    weekTab: {
      borderRadius: tokens.radius.pill,
      height: 28,
      minWidth: 38,
      paddingHorizontal: tokens.spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(tokens.colors.primary, 0.1),
    },
    weekTabActive: {
      backgroundColor: tokens.colors.primary,
    },
    weekTabText: {
      color: tokens.colors.primary,
      fontSize: 12,
      fontFamily: 'SpaceGrotesk_700Bold',
    },
    weekTabTextActive: {
      color: tokens.colors.onPrimary,
    },
    addButton: {
      marginTop: tokens.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
      paddingVertical: tokens.spacing.md,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: tokens.colors.borderStrong,
      backgroundColor: 'transparent',
    },
    addButtonText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
  });
}
