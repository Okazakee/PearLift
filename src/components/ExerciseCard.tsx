import { Dumbbell, Edit2, Minus, Plus, Trash2 } from 'lucide-react-native';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import type { Exercise, WeightUnit } from '@/types';
import {
  formatWeight,
  formatWeightUnit,
  fromDisplayWeight,
  getWeightStep,
  toDisplayWeight,
} from '@/utils/units';
import { Text, TextInput } from './AppText';

interface ExerciseCardProps {
  tokens: ThemeTokens;
  exercise: Exercise;
  weightUnit: WeightUnit;
  baseWeight: number;
  adjustedWeight: number;
  onAdjustWeight: (exerciseId: string, delta: number) => void;
  onSetWeight: (exerciseId: string, value: number) => void;
  onEditExercise: (exercise: Exercise) => void;
  onDeleteExercise: (exercise: Exercise) => void;
}

function ExerciseCardComponent({
  tokens,
  exercise,
  weightUnit,
  baseWeight,
  adjustedWeight,
  onAdjustWeight,
  onSetWeight,
  onEditExercise,
  onDeleteExercise,
}: ExerciseCardProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const setsRepsLabel = `${exercise.sets}x${exercise.reps}`;
  const [editingWeight, setEditingWeight] = useState(false);
  const baseDisplayWeight = toDisplayWeight(baseWeight, weightUnit);
  const adjustedDisplayWeight = toDisplayWeight(adjustedWeight, weightUnit);
  const [tempWeight, setTempWeight] = useState(
    formatWeight(baseDisplayWeight, weightUnit),
  );
  const submitGuardRef = useRef(false);

  const step = getWeightStep(baseDisplayWeight, weightUnit);
  const handleWeightAdjust = useCallback(
    (direction: -1 | 1) => {
      const deltaKg = fromDisplayWeight(direction * step, weightUnit);
      onAdjustWeight(exercise.id, deltaKg);
    },
    [exercise.id, onAdjustWeight, step, weightUnit],
  );

  const handleWeightSubmit = useCallback(() => {
    if (submitGuardRef.current) return;
    submitGuardRef.current = true;
    const parsed = Number(tempWeight);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEditingWeight(false);
      setTempWeight(formatWeight(baseDisplayWeight, weightUnit));
      submitGuardRef.current = false;
      return;
    }
    onSetWeight(exercise.id, fromDisplayWeight(parsed, weightUnit));
    setEditingWeight(false);
    submitGuardRef.current = false;
  }, [baseDisplayWeight, exercise.id, onSetWeight, tempWeight, weightUnit]);

  const handleEdit = useCallback(() => {
    onEditExercise(exercise);
  }, [exercise, onEditExercise]);

  const handleDelete = useCallback(() => {
    onDeleteExercise(exercise);
  }, [exercise, onDeleteExercise]);

  return (
    <AnimatedPressable style={styles.card} pressScale={1}>
      <View style={styles.topRow}>
        <Text style={styles.name}>{exercise.name}</Text>
        <View style={styles.topActions}>
          <AnimatedPressable
            style={[styles.iconButton, styles.iconButtonEdit]}
            onPress={handleEdit}
          >
            <Edit2 size={16} color={tokens.colors.textSecondary} />
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.iconButton, styles.iconButtonDelete]}
            onPress={handleDelete}
          >
            <Trash2 size={17} color={tokens.colors.error} />
          </AnimatedPressable>
        </View>
      </View>

      <View style={styles.chipsRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{exercise.muscleGroup}</Text>
        </View>
        <View style={styles.repChip}>
          <Text style={styles.repChipText}>{setsRepsLabel}</Text>
        </View>
      </View>

      {exercise.notes.length > 0 && (
        <Text style={styles.notes}>💡 {exercise.notes}</Text>
      )}

      <View style={styles.weightControl}>
        <AnimatedPressable
          style={[styles.stepButton, styles.stepButtonMinus]}
          onPress={() => handleWeightAdjust(-1)}
        >
          <Minus size={18} color={tokens.colors.error} />
        </AnimatedPressable>

        {editingWeight ? (
          <View style={styles.inlineEdit}>
            <TextInput
              style={styles.weightInput}
              value={tempWeight}
              onChangeText={setTempWeight}
              keyboardType="decimal-pad"
              autoFocus
              onBlur={handleWeightSubmit}
              onSubmitEditing={handleWeightSubmit}
              returnKeyType="done"
            />
            <Text style={styles.weightUnit}>
              {formatWeightUnit(weightUnit)}
            </Text>
          </View>
        ) : (
          <AnimatedPressable
            style={styles.weightValueRow}
            onPress={() => {
              setTempWeight(formatWeight(baseDisplayWeight, weightUnit));
              setEditingWeight(true);
            }}
          >
            <Dumbbell size={24} color={tokens.colors.primary} />
            <Text style={styles.weightValue}>
              {formatWeight(adjustedDisplayWeight, weightUnit)}
            </Text>
            <Text style={styles.weightUnit}>
              {formatWeightUnit(weightUnit)}
            </Text>
          </AnimatedPressable>
        )}

        <AnimatedPressable
          style={[styles.stepButton, styles.stepButtonPlus]}
          onPress={() => handleWeightAdjust(1)}
        >
          <Plus size={18} color={tokens.colors.success} />
        </AnimatedPressable>
      </View>
    </AnimatedPressable>
  );
}

export const ExerciseCard = memo(
  ExerciseCardComponent,
  (prev, next) =>
    prev.tokens === next.tokens &&
    prev.weightUnit === next.weightUnit &&
    prev.baseWeight === next.baseWeight &&
    prev.adjustedWeight === next.adjustedWeight &&
    prev.exercise.id === next.exercise.id &&
    prev.exercise.name === next.exercise.name &&
    prev.exercise.muscleGroup === next.exercise.muscleGroup &&
    prev.exercise.notes === next.exercise.notes &&
    prev.exercise.sets === next.exercise.sets &&
    prev.exercise.reps === next.exercise.reps,
);

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    card: {
      flex: 1,
      minHeight: 196,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.sm,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    topActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
    },
    badge: {
      paddingHorizontal: tokens.spacing.sm + 6,
      paddingVertical: tokens.spacing.xs + 1,
      borderRadius: 14,
      backgroundColor: withAlpha(tokens.colors.primary, 0.12),
    },
    badgeText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.label,
      fontWeight: '500',
      letterSpacing: 0.3,
    },
    chipsRow: {
      flexDirection: 'row',
      gap: tokens.spacing.xs,
      flexWrap: 'wrap',
    },
    iconButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconButtonEdit: {
      backgroundColor: withAlpha(tokens.colors.textSecondary, 0.1),
    },
    iconButtonDelete: {
      backgroundColor: withAlpha(tokens.colors.error, 0.12),
    },
    repChip: {
      paddingHorizontal: tokens.spacing.sm + 6,
      paddingVertical: tokens.spacing.xs + 1,
      borderRadius: 14,
      backgroundColor: tokens.colors.bgElevated,
    },
    repChipText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    name: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
    },
    notes: {
      color: tokens.colors.textMuted,
      fontSize: tokens.type.body,
      lineHeight: 19,
    },
    weightControl: {
      marginTop: tokens.spacing.sm,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.md,
      borderRadius: 16,
      backgroundColor: tokens.colors.bgElevated,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    weightValue: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.metric,
      fontFamily: 'SpaceGrotesk_700Bold',
      minWidth: 74,
      textAlign: 'center',
    },
    weightValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
    },
    weightUnit: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontFamily: 'SpaceGrotesk_500Medium',
      alignSelf: 'flex-end',
      marginBottom: 6,
    },
    inlineEdit: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
    },
    weightInput: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.metric,
      fontFamily: 'SpaceGrotesk_700Bold',
      minWidth: 82,
      textAlign: 'center',
      paddingVertical: 0,
    },
    stepButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepButtonMinus: {
      backgroundColor: withAlpha(tokens.colors.error, 0.12),
    },
    stepButtonPlus: {
      backgroundColor: withAlpha(tokens.colors.success, 0.12),
    },
  });
}
