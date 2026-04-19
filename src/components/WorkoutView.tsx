import { Feather } from '@expo/vector-icons';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, {
  type RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
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
  fabBottom,
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
  const styles = useMemo(
    () => createStyles(tokens, contentBottomPadding, fabBottom),
    [tokens, contentBottomPadding, fabBottom],
  );
  const week = weekConfigs.find((w) => w.id === currentWeek) ?? weekConfigs[0];
  const dayNumberMatch = workout.name.match(/\d+/);
  const dayLabel = dayNumberMatch ? `Day ${dayNumberMatch[0]}` : workout.name;
  const sortedExercises = useMemo(
    () => [...workout.exercises].sort((a, b) => a.position - b.position),
    [workout.exercises],
  );
  const keyExtractor = useCallback((item: Exercise) => item.id, []);

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
            <Feather
              name="sliders"
              size={16}
              color={tokens.colors.textSecondary}
            />
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
        <Feather name="plus" size={16} color={tokens.colors.primary} />
        <Text style={styles.addButtonText}>Add Exercise</Text>
      </AnimatedPressable>
    ),
    [onOpenAddExercise, styles, tokens.colors.primary],
  );

  const renderItem = useCallback(
    ({ item, getIndex, drag, isActive }: RenderItemParams<Exercise>) => {
      const index = getIndex() ?? 0;
      return (
        <ScaleDecorator activeScale={1.015}>
          <View
            style={[
              index < sortedExercises.length - 1
                ? styles.exerciseItem
                : undefined,
              isActive && styles.exerciseItemActive,
            ]}
          >
            <ExerciseCard
              tokens={tokens}
              exercise={item}
              weightUnit={weightUnit}
              baseWeight={userWeights[item.id] ?? item.baseWeight}
              adjustedWeight={getAdjustedWeight(item.id, currentWeek)}
              onAdjustWeight={onAdjustWeight}
              onSetWeight={onSetWeight}
              onEditExercise={onEditExercise}
              onDeleteExercise={onDeleteExercise}
              onDragStart={drag}
            />
          </View>
        </ScaleDecorator>
      );
    },
    [
      currentWeek,
      getAdjustedWeight,
      onAdjustWeight,
      onDeleteExercise,
      onEditExercise,
      onSetWeight,
      sortedExercises.length,
      styles.exerciseItem,
      styles.exerciseItemActive,
      tokens,
      userWeights,
      weightUnit,
    ],
  );

  return (
    <View style={styles.container}>
      <DraggableFlatList
        data={sortedExercises}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={16}
        windowSize={7}
        removeClippedSubviews
        activationDistance={16}
        onDragEnd={({ data }) =>
          onReorderExercises(data.map((item) => item.id))
        }
      />
    </View>
  );
}

function createStyles(
  tokens: ThemeTokens,
  contentBottomPadding: number,
  _fabBottom: number,
) {
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
    exerciseItem: {
      marginBottom: tokens.spacing.md,
    },
    exerciseItemActive: {
      transform: [{ scale: 1.005 }],
    },
    fab: {
      display: 'none',
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
