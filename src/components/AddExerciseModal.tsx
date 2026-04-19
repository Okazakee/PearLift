import { X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { muscleGroups } from '../data/workouts';
import type { ThemeTokens } from '../theme/tokens';
import type { Exercise } from '../types';
import { AnimatedModalShell } from './AnimatedModalShell';

interface FormExercise {
  name: string;
  muscleGroup: string;
  sets: string;
  reps: string;
  notes: string;
}

interface AddExerciseModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  tokens: ThemeTokens;
  initialExercise?: Exercise | null;
  onClose: () => void;
  onSubmit: (value: Omit<Exercise, 'id' | 'position' | 'baseWeight'>) => void;
}

const blankState: FormExercise = {
  name: '',
  muscleGroup: 'Chest',
  sets: '2',
  reps: '8-10',
  notes: '',
};

export function AddExerciseModal({
  open,
  mode,
  tokens,
  initialExercise,
  onClose,
  onSubmit,
}: AddExerciseModalProps) {
  const [form, setForm] = useState<FormExercise>(blankState);
  const [error, setError] = useState<string | null>(null);
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initialExercise) {
      setForm({
        name: initialExercise.name,
        muscleGroup: initialExercise.muscleGroup,
        sets: String(initialExercise.sets),
        reps: initialExercise.reps,
        notes: initialExercise.notes,
      });
    } else {
      setForm(blankState);
    }
    setError(null);
  }, [open, mode, initialExercise]);

  const handleSubmit = () => {
    const parsedSets = Number(form.sets);
    if (!form.name.trim()) {
      setError('Exercise name is required.');
      return;
    }
    if (
      !Number.isFinite(parsedSets) ||
      parsedSets <= 0 ||
      !Number.isInteger(parsedSets)
    ) {
      setError('Sets must be a valid positive integer.');
      return;
    }
    onSubmit({
      name: form.name.trim(),
      muscleGroup: form.muscleGroup,
      sets: parsedSets,
      reps: form.reps.trim() || '8-10',
      notes: form.notes.trim(),
    });
    onClose();
  };

  return (
    <AnimatedModalShell
      open={open}
      onClose={onClose}
      containerStyle={styles.modalRoot}
      backdropStyle={styles.backdrop}
      sheetStyle={styles.sheet}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>
          {mode === 'add' ? 'Add Exercise' : 'Edit Exercise'}
        </Text>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <X size={18} color={tokens.colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Text style={styles.label}>Name</Text>
        <TextInput
          value={form.name}
          onChangeText={(text) => setForm((prev) => ({ ...prev, name: text }))}
          placeholder="Exercise name"
          placeholderTextColor={tokens.colors.textMuted}
          style={styles.input}
        />

        <Text style={styles.label}>Muscle Group</Text>
        <View style={styles.chipsWrap}>
          {muscleGroups.map((muscle) => {
            const active = form.muscleGroup === muscle;
            return (
              <Pressable
                key={muscle}
                onPress={() =>
                  setForm((prev) => ({ ...prev, muscleGroup: muscle }))
                }
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {muscle}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Sets</Text>
            <TextInput
              value={form.sets}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, sets: text }))
              }
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Reps</Text>
            <TextInput
              value={form.reps}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, reps: text }))
              }
              style={styles.input}
            />
          </View>
        </View>

        <Text style={styles.label}>Notes</Text>
        <TextInput
          value={form.notes}
          onChangeText={(text) => setForm((prev) => ({ ...prev, notes: text }))}
          style={[styles.input, styles.textarea]}
          placeholder="Optional notes..."
          placeholderTextColor={tokens.colors.textMuted}
          multiline
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitText}>
            {mode === 'add' ? 'Add Exercise' : 'Save Changes'}
          </Text>
        </Pressable>
      </ScrollView>
    </AnimatedModalShell>
  );
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    modalRoot: {
      paddingHorizontal: tokens.spacing.lg,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.58)',
    },
    sheet: {
      width: '100%',
      maxWidth: 560,
      maxHeight: '86%',
      backgroundColor: tokens.colors.surfaceContainer,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: tokens.spacing.lg,
      paddingBottom: tokens.spacing.md,
    },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
    },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      paddingTop: tokens.spacing.md,
      paddingBottom: tokens.spacing.xxl,
      gap: tokens.spacing.sm,
    },
    label: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
      letterSpacing: 0.9,
      marginTop: tokens.spacing.xs,
    },
    input: {
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      borderRadius: 12,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: 10,
    },
    textarea: {
      minHeight: 84,
      textAlignVertical: 'top',
    },
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing.xs,
    },
    chip: {
      borderRadius: tokens.radius.pill,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      paddingHorizontal: tokens.spacing.sm + 4,
      paddingVertical: tokens.spacing.xs + 2,
    },
    chipActive: {
      backgroundColor: tokens.colors.primary,
    },
    chipText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    chipTextActive: {
      color: tokens.colors.onPrimary,
    },
    row: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
    },
    col: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    error: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.body,
      fontWeight: '600',
      marginTop: tokens.spacing.xs,
    },
    submitButton: {
      marginTop: tokens.spacing.md,
      borderRadius: tokens.radius.md,
      paddingVertical: tokens.spacing.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
    },
    submitText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
  });
}
