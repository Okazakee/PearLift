import { ChevronLeft, ChevronRight, Plus, Sliders } from 'lucide-react-native';
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
  DayConfig,
  Exercise,
  TrainingProgram,
  UserExerciseSettingsMap,
  WeekConfig,
  WeightUnit,
  WorkoutSession,
} from '@/types';
import { getExerciseTargetForWeek } from '@/utils/exerciseTargets';
import {
  getWeekTitle,
  hasNamedWeekConfigs,
  resolveAppliedLoadModifier,
} from '@/utils/program';
import { getRestSeconds, shouldShowRestChip } from '@/utils/rest';
import { getDayDisplayInfo } from '@/utils/schedule';
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
  dayConfig?: DayConfig | null;
  program?: TrainingProgram | null;
  currentWeek: number;
  weekConfigs: WeekConfig[];
  userExerciseSettings: UserExerciseSettingsMap;
  restDuration: number;
  getAdjustedWeight: (exerciseId: string, weekId?: number) => number;
  suggestedDayName?: string | null;
  onWeekChange: (id: number) => void;
  onOpenProgramSettings: () => void;
  onOpenProgressionSuggestions: () => void;
  onOpenWorkoutLog: () => void;
  pendingProgressionSuggestionCount: number;
  onOpenAddExercise: () => void;
  onOpenExerciseSettings: (exercise: Exercise) => void;
  onApplyRestPreset: (restSeconds: number) => void;
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
  dayConfig = null,
  program = null,
  currentWeek,
  weekConfigs,
  userExerciseSettings,
  restDuration,
  getAdjustedWeight,
  suggestedDayName = null,
  onWeekChange,
  onOpenProgramSettings,
  onOpenProgressionSuggestions,
  onOpenWorkoutLog,
  pendingProgressionSuggestionCount,
  onOpenAddExercise,
  onOpenExerciseSettings,
  onApplyRestPreset,
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
  const hasNamedWeeks = hasNamedWeekConfigs(weekConfigs);
  const week = weekConfigs.find((w) => w.id === currentWeek) ?? weekConfigs[0];
  const loadModifier = resolveAppliedLoadModifier({
    progressionModel: program?.progressionModel ?? null,
    loadModifier: week?.loadModifier ?? 1,
  });
  const volumeModifier = week?.volumeModifier ?? 1;
  const showLoadBadge =
    loadModifier !== 1 ||
    program?.progressionModel === 'simple_load_modifier' ||
    program?.progressionModel == null;
  const dayDisplay = useMemo(
    () => getDayDisplayInfo(dayConfig ?? { name: workout.name }),
    [dayConfig, workout.name],
  );
  const suggestedDayDisplayName = useMemo(
    () =>
      suggestedDayName
        ? getDayDisplayInfo({ name: suggestedDayName }).title
        : null,
    [suggestedDayName],
  );
  const sortedExercises = useMemo(
    () => [...workout.exercises].sort((a, b) => a.position - b.position),
    [workout.exercises],
  );
  const exerciseById = useMemo(
    () => new Map(sortedExercises.map((exercise) => [exercise.id, exercise])),
    [sortedExercises],
  );
  const displayExerciseById = useMemo(
    () =>
      new Map(
        sortedExercises.map((exercise) => [
          exercise.id,
          getExerciseTargetForWeek(exercise, currentWeek),
        ]),
      ),
    [currentWeek, sortedExercises],
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
            {t('workout.weekDay', {
              week: currentWeek,
              day: dayDisplay.title,
            })}
          </Text>
          <Text style={styles.workoutName}>
            {getWeekTitle(week, currentWeek)}
          </Text>
          {dayDisplay.metaLabel ? (
            <Text style={styles.summaryHint}>{dayDisplay.metaLabel}</Text>
          ) : null}
          {suggestedDayDisplayName ? (
            <Text style={styles.summaryHint}>
              {t('workout.suggestedToday', {
                workout: suggestedDayDisplayName,
              })}
            </Text>
          ) : null}
          {week?.notes ? (
            <Text style={styles.summaryHint}>{week.notes}</Text>
          ) : null}
          <View style={styles.badges}>
            <View style={styles.rirBadge}>
              <Text style={styles.rirBadgeLabel}>RIR {week?.rir ?? 2}</Text>
            </View>
            {showLoadBadge ? (
              <View style={styles.loadBadge}>
                <Text style={styles.loadBadgeLabel}>
                  {loadModifier === 1
                    ? 'Baseline'
                    : loadModifier < 1
                      ? `-${Math.round((1 - loadModifier) * 100)}%`
                      : `+${Math.round((loadModifier - 1) * 100)}%`}
                </Text>
              </View>
            ) : null}
            <View style={styles.loadBadge}>
              <Text style={styles.loadBadgeLabel}>
                {volumeModifier === 1
                  ? 'Volume baseline'
                  : volumeModifier < 1
                    ? `Volume -${Math.round((1 - volumeModifier) * 100)}%`
                    : `Volume +${Math.round((volumeModifier - 1) * 100)}%`}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.weekTabs}>
          <View style={styles.weekTabsInner}>
            {hasNamedWeeks ? (
              weekConfigs.map((item) => {
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
              })
            ) : (
              <>
                <AnimatedPressable
                  style={[
                    styles.weekTab,
                    currentWeek <= 1 && styles.weekTabDisabled,
                  ]}
                  disabled={currentWeek <= 1}
                  onPress={() => onWeekChange(Math.max(1, currentWeek - 1))}
                  accessibilityLabel={t('common.back')}
                  testID={E2E_IDS.workout.weekPrevious}
                >
                  <ChevronLeft size={16} color={tokens.colors.primary} />
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.weekTab}
                  onPress={() => onWeekChange(currentWeek + 1)}
                  accessibilityLabel={t('common.next')}
                  testID={E2E_IDS.workout.weekNext}
                >
                  <ChevronRight size={16} color={tokens.colors.primary} />
                </AnimatedPressable>
              </>
            )}
          </View>
          <View style={styles.headerActions}>
            {pendingProgressionSuggestionCount > 0 ? (
              <AnimatedPressable
                style={styles.logButton}
                onPress={onOpenProgressionSuggestions}
                testID={E2E_IDS.workout.progressionSuggestionsOpen}
              >
                <Text style={styles.logButtonText}>
                  {t('workout.progressionSuggestions')}
                  {` (${pendingProgressionSuggestionCount})`}
                </Text>
              </AnimatedPressable>
            ) : null}
            <AnimatedPressable
              style={styles.logButton}
              onPress={onOpenWorkoutLog}
            >
              <Text style={styles.logButtonText}>
                {t('workout.logWorkout')}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.settingsButton}
              onPress={onOpenProgramSettings}
              testID={E2E_IDS.workout.programSettings}
            >
              <Sliders size={16} color={tokens.colors.textSecondary} />
            </AnimatedPressable>
          </View>
        </View>
      </>
    ),
    [
      currentWeek,
      dayDisplay.metaLabel,
      dayDisplay.title,
      hasNamedWeeks,
      onOpenProgressionSuggestions,
      onOpenWorkoutLog,
      onOpenProgramSettings,
      onWeekChange,
      pendingProgressionSuggestionCount,
      suggestedDayDisplayName,
      styles,
      t,
      tokens.colors.primary,
      tokens.colors.textSecondary,
      loadModifier,
      showLoadBadge,
      volumeModifier,
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
      const displayExercise = displayExerciseById.get(item) ?? exercise;
      if (!exercise || !displayExercise) return null;
      const restSeconds = getRestSeconds({
        exercise: displayExercise,
        workout,
        program,
        settingsRestSeconds: restDuration,
      });
      const showRestChip = shouldShowRestChip({
        exercise: displayExercise,
        workout,
        program,
        settingsRestSeconds: restDuration,
      });
      return (
        <ExerciseCard
          tokens={tokens}
          exercise={displayExercise}
          sourceExercise={exercise}
          currentWeek={currentWeek}
          weightUnit={weightUnit}
          exerciseSettings={userExerciseSettings[exercise.id] ?? null}
          restSeconds={restSeconds}
          showRestChip={showRestChip}
          loadModifier={loadModifier}
          adjustedWeight={getAdjustedWeight(exercise.id, currentWeek)}
          onOpenExerciseSettings={onOpenExerciseSettings}
          onApplyRestPreset={onApplyRestPreset}
          onAdjustWeight={onAdjustWeight}
          onSetWeight={onSetWeight}
          onEditExercise={onEditExercise}
          onDeleteExercise={onDeleteExercise}
        />
      );
    },
    [
      currentWeek,
      displayExerciseById,
      exerciseById,
      getAdjustedWeight,
      loadModifier,
      program,
      onOpenExerciseSettings,
      onApplyRestPreset,
      onAdjustWeight,
      onDeleteExercise,
      onEditExercise,
      onSetWeight,
      restDuration,
      tokens,
      userExerciseSettings,
      weightUnit,
      workout,
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
    summaryHint: {
      color: withAlpha(tokens.colors.textPrimary, 0.72),
      fontSize: tokens.type.label - 1,
      fontFamily: 'SpaceGrotesk_500Medium',
      textAlign: 'center',
      marginTop: -2,
    },
    settingsButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: tokens.colors.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
    },
    logButton: {
      minHeight: 36,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.primary, 0.24),
      paddingHorizontal: tokens.spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(tokens.colors.primary, 0.08),
    },
    logButtonText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.label,
      fontWeight: '700',
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
    weekTabDisabled: {
      opacity: 0.4,
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
