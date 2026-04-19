import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../animation/primitives';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';
import type { Exercise } from '../types';

interface ExerciseCardProps {
  tokens: ThemeTokens;
  exercise: Exercise;
  baseWeight: number;
  adjustedWeight: number;
  isFirst: boolean;
  isLast: boolean;
  onAdjustWeight: (delta: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ExerciseCard({
  tokens,
  exercise,
  baseWeight,
  adjustedWeight,
  isFirst,
  isLast,
  onAdjustWeight,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: ExerciseCardProps) {
  const styles = createStyles(tokens);
  const setsRepsLabel = `${exercise.sets}x${exercise.reps}`;
  const [editingWeight, setEditingWeight] = useState(false);
  const [tempWeight, setTempWeight] = useState(baseWeight.toString());
  const submitGuardRef = useRef(false);

  const step = baseWeight >= 20 ? 2.5 : 1;
  const handleWeightAdjust = (direction: -1 | 1) => {
    onAdjustWeight(direction * step);
  };

  const handleWeightSubmit = () => {
    if (submitGuardRef.current) return;
    submitGuardRef.current = true;
    const parsed = Number(tempWeight);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEditingWeight(false);
      setTempWeight(baseWeight.toString());
      submitGuardRef.current = false;
      return;
    }
    onAdjustWeight(parsed - baseWeight);
    setEditingWeight(false);
    submitGuardRef.current = false;
  };

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.name}>{exercise.name}</Text>
        <AnimatedPressable style={styles.iconButton} onPress={onEdit}>
          <Feather
            name="edit-2"
            size={16}
            color={tokens.colors.textSecondary}
          />
        </AnimatedPressable>
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
          <Feather name="minus" size={18} color={tokens.colors.error} />
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
            <Text style={styles.weightUnit}>kg</Text>
          </View>
        ) : (
          <AnimatedPressable
            style={styles.weightValueRow}
            onPress={() => {
              setTempWeight(baseWeight.toString());
              setEditingWeight(true);
            }}
          >
            <MaterialCommunityIcons
              name="dumbbell"
              size={24}
              color={tokens.colors.primary}
            />
            <Text style={styles.weightValue}>{adjustedWeight.toFixed(1)}</Text>
            <Text style={styles.weightUnit}>kg</Text>
          </AnimatedPressable>
        )}

        <AnimatedPressable
          style={[styles.stepButton, styles.stepButtonPlus]}
          onPress={() => handleWeightAdjust(1)}
        >
          <Feather name="plus" size={18} color={tokens.colors.success} />
        </AnimatedPressable>
      </View>

      <View style={styles.bottomActions}>
        <AnimatedPressable
          style={[styles.actionButton, isFirst && styles.disabledButton]}
          disabled={isFirst}
          onPress={onMoveUp}
        >
          <Feather
            name="chevron-up"
            size={16}
            color={isFirst ? tokens.colors.textMuted : tokens.colors.primary}
          />
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.actionButton, isLast && styles.disabledButton]}
          disabled={isLast}
          onPress={onMoveDown}
        >
          <Feather
            name="chevron-down"
            size={16}
            color={isLast ? tokens.colors.textMuted : tokens.colors.primary}
          />
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.actionButton, styles.deleteAction]}
          onPress={onDelete}
        >
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={17}
            color={tokens.colors.error}
          />
        </AnimatedPressable>
      </View>
    </View>
  );
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    card: {
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
    repChip: {
      paddingHorizontal: tokens.spacing.sm + 6,
      paddingVertical: tokens.spacing.xs + 1,
      borderRadius: 14,
      backgroundColor: tokens.colors.bgElevated,
    },
    repChipText: {
      color: tokens.colors.secondary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    disabledButton: {
      opacity: 0.5,
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
      color: '#ffffff',
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
      color: '#ffffff',
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
    bottomActions: {
      marginTop: tokens.spacing.sm,
      flexDirection: 'row',
      gap: tokens.spacing.xs,
    },
    actionButton: {
      flex: 1,
      height: 34,
      borderRadius: tokens.radius.sm,
      backgroundColor: withAlpha(tokens.colors.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteAction: {
      backgroundColor: '#291a1c',
    },
  });
}
