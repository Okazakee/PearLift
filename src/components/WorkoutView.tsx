import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';
import type {
  Exercise,
  UserWeights,
  WeekConfig,
  WorkoutSession,
} from '../types';
import { ExerciseCard } from './ExerciseCard';

interface WorkoutViewProps {
  tokens: ThemeTokens;
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
  onMoveExercise: (exerciseId: string, direction: 'up' | 'down') => void;
}

export function WorkoutView({
  tokens,
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
  onMoveExercise,
}: WorkoutViewProps) {
  const styles = createStyles(tokens, contentBottomPadding, fabBottom);
  const week = weekConfigs.find((w) => w.id === currentWeek) ?? weekConfigs[0];
  const sortedExercises = [...workout.exercises].sort(
    (a, b) => a.position - b.position,
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <View style={styles.decorCircleA} />
          <View style={styles.decorCircleB} />
          <Text style={styles.workoutName}>
            {week?.name ?? `Week ${currentWeek}`} - {workout.name}
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
                <Pressable
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
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={styles.settingsButton}
            onPress={onOpenProgramSettings}
          >
            <MaterialIcons
              name="settings"
              size={18}
              color={tokens.colors.textSecondary}
            />
          </Pressable>
        </View>

        <View style={styles.list}>
          {sortedExercises.map((exercise, index) => (
            <ExerciseCard
              key={exercise.id}
              tokens={tokens}
              exercise={exercise}
              baseWeight={userWeights[exercise.id] ?? exercise.baseWeight}
              adjustedWeight={getAdjustedWeight(exercise.id, currentWeek)}
              isFirst={index === 0}
              isLast={index === sortedExercises.length - 1}
              onAdjustWeight={(delta) => onAdjustWeight(exercise.id, delta)}
              onMoveUp={() => onMoveExercise(exercise.id, 'up')}
              onMoveDown={() => onMoveExercise(exercise.id, 'down')}
              onEdit={() => onEditExercise(exercise)}
              onDelete={() => onDeleteExercise(exercise)}
            />
          ))}
        </View>
      </ScrollView>

      <Pressable style={styles.fab} onPress={onOpenAddExercise}>
        <MaterialIcons name="add" size={24} color={tokens.colors.onPrimary} />
      </Pressable>
    </View>
  );
}

function createStyles(
  tokens: ThemeTokens,
  contentBottomPadding: number,
  fabBottom: number,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: tokens.spacing.lg,
      paddingBottom: contentBottomPadding,
      gap: tokens.spacing.md,
    },
    summaryCard: {
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
      fontWeight: '800',
      fontSize: tokens.type.subtitle,
      letterSpacing: 0.4,
      textAlign: 'center',
    },
    settingsButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
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
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs + 1,
    },
    rirBadgeLabel: {
      color: tokens.colors.accentWarning,
      fontWeight: '500',
      fontSize: 12,
      letterSpacing: 0.3,
    },
    loadBadge: {
      borderRadius: tokens.radius.pill,
      backgroundColor: withAlpha(tokens.colors.success, 0.16),
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs + 1,
    },
    loadBadgeLabel: {
      color: tokens.colors.success,
      fontWeight: '600',
      fontSize: 12,
      letterSpacing: 0.3,
    },
    weekTabs: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: tokens.spacing.xs,
    },
    weekTabsInner: {
      flexDirection: 'row',
      gap: tokens.spacing.xs,
    },
    weekTab: {
      borderRadius: tokens.radius.pill,
      width: 36,
      height: 28,
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
      fontWeight: '700',
    },
    weekTabTextActive: {
      color: tokens.colors.onPrimary,
    },
    list: {
      gap: tokens.spacing.md,
    },
    fab: {
      position: 'absolute',
      right: 22,
      bottom: fabBottom,
      width: 54,
      height: 54,
      borderRadius: 16,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: tokens.colors.primary,
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
  });
}
