import { Plus, Sliders } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnUI,
  scrollTo,
  useAnimatedRef,
} from 'react-native-reanimated';
import type { SortableGridRenderItem } from 'react-native-sortables';
import Sortable from 'react-native-sortables';
import { AnimatedPressable } from '@/animation/primitives';
import { ExerciseCard } from '@/components/ExerciseCard';
import { E2E_IDS } from '@/config/testIds';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import type {
  Exercise,
  UserWeights,
  WeekConfig,
  WeightUnit,
  WorkoutSession,
} from '@/types';
import { Text } from './AppText';

interface WorkoutViewProps {
  isActive: boolean;
  tokens: ThemeTokens;
  weightUnit: WeightUnit;
  contentBottomPadding: number;
  fabBottom: number;
  contentMaxWidth: number;
  exerciseColumns: number;
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
  isActive,
  tokens,
  weightUnit,
  contentBottomPadding,
  fabBottom: _fabBottom,
  contentMaxWidth,
  exerciseColumns,
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
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const pendingScrollResetRef = useRef(false);

  const resetScroll = useCallback(() => {
    runOnUI(() => {
      'worklet';
      scrollTo(scrollRef, 0, 0, false);
    })();
  }, [scrollRef]);

  useEffect(() => {
    if (!isActive) {
      pendingScrollResetRef.current = false;
      resetScroll();
      return;
    }

    pendingScrollResetRef.current = true;
    resetScroll();

    const t1 = setTimeout(resetScroll, 0);
    const t2 = setTimeout(resetScroll, 50);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isActive, resetScroll]);

  const styles = useMemo(
    () => createStyles(tokens, contentBottomPadding, contentMaxWidth),
    [tokens, contentBottomPadding, contentMaxWidth],
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
  const [savedOrderByWorkout, setSavedOrderByWorkout] = useState<
    Record<string, string[]>
  >({});

  const displayExerciseIds = useMemo(() => {
    const saved = savedOrderByWorkout[workout.id];
    if (saved?.every((id) => exerciseById.has(id))) return saved;
    return sortedExerciseIds;
  }, [savedOrderByWorkout, workout.id, sortedExerciseIds, exerciseById]);

  const renderHeader = useCallback(
    () => (
      <>
        <View style={styles.summaryCard}>
          <View style={styles.decorCircleA} />
          <View style={styles.decorCircleB} />
          <Text style={styles.metaText}>
            {t('workout.weekDay', { week: currentWeek, day: dayLabel })}
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
                  testID={E2E_IDS.workout.weekTab(item.id)}
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
            testID={E2E_IDS.workout.programSettings}
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
      t,
      tokens.colors.textSecondary,
      week,
      weekConfigs,
    ],
  );

  const renderFooter = useCallback(
    () => (
      <AnimatedPressable
        style={styles.addButton}
        onPress={onOpenAddExercise}
        testID={E2E_IDS.workout.addExercise}
      >
        <Plus size={16} color={tokens.colors.primary} />
        <Text style={styles.addButtonText}>{t('workout.addExercise')}</Text>
      </AnimatedPressable>
    ),
    [onOpenAddExercise, styles, t, tokens.colors.primary],
  );

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
        onLayout={() => {
          if (!pendingScrollResetRef.current) return;
          resetScroll();
          pendingScrollResetRef.current = false;
        }}
        onContentSizeChange={() => {
          if (!pendingScrollResetRef.current) return;
          resetScroll();
          pendingScrollResetRef.current = false;
        }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.mainColumn}>
          {renderHeader()}
          <Sortable.Grid
            enableActiveItemSnap={false}
            data={displayExerciseIds}
            keyExtractor={(id) => id}
            renderItem={renderItem}
            columns={exerciseColumns}
            rowGap={layout.isTablet ? tokens.spacing.sm : tokens.spacing.md}
            columnGap={layout.isTablet ? tokens.spacing.sm : 0}
            scrollableRef={scrollRef}
            dragActivationDelay={300}
            activeItemScale={1.02}
            activeItemOpacity={0.95}
            activeItemShadowOpacity={0.12}
            dropAnimationDuration={200}
            itemEntering={null}
            itemExiting={null}
            onDragEnd={({ data: reordered }) => {
              setSavedOrderByWorkout((prev) => ({
                ...prev,
                [workout.id]: reordered,
              }));
              onReorderExercises(reordered);
            }}
          />
          {renderFooter()}
        </View>
      </Animated.ScrollView>
    </View>
  );
}

function createStyles(
  tokens: ThemeTokens,
  contentBottomPadding: number,
  contentMaxWidth: number,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: tokens.spacing.lg,
      paddingBottom: contentBottomPadding,
      alignItems: 'center',
    },
    mainColumn: {
      width: '100%',
      maxWidth: contentMaxWidth,
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
