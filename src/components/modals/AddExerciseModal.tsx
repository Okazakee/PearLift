import { X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AnimatedModalShell } from '@/components/AnimatedModalShell';
import { E2E_IDS } from '@/config/testIds';
import { muscleGroups } from '@/data/workouts';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { ThemeTokens } from '@/theme/tokens';
import type { Exercise } from '@/types';
import { Text, TextInput } from '../AppText';

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
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const [form, setForm] = useState<FormExercise>(blankState);
  const [error, setError] = useState<string | null>(null);
  const resetKey = open ? `${mode}:${initialExercise?.id ?? 'new'}` : null;
  const prevResetKeyRef = useRef<string | null>(resetKey);
  const styles = useMemo(() => createStyles(tokens, layout), [tokens, layout]);

  if (resetKey !== prevResetKeyRef.current) {
    prevResetKeyRef.current = resetKey;
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
  }

  const handleSubmit = () => {
    const parsedSets = Number(form.sets);
    if (!form.name.trim()) {
      setError(t('addExercise.errors.nameRequired'));
      return;
    }
    if (
      !Number.isFinite(parsedSets) ||
      parsedSets <= 0 ||
      !Number.isInteger(parsedSets)
    ) {
      setError(t('addExercise.errors.setsInvalid'));
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

  if (layout.isTablet && mode === 'edit') {
    return (
      <AnimatedModalShell
        open={open}
        onClose={onClose}
        slideFrom="right"
        containerStyle={styles.tabletPanelModalRoot}
        backdropStyle={styles.tabletPanelBackdrop}
        sheetStyle={styles.tabletPanelSheet}
      >
        <View style={styles.tabletPanel}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t('addExercise.titleEdit')}</Text>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              testID={E2E_IDS.exerciseModal.close}
              hitSlop={8}
            >
              <X size={18} color={tokens.colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <Text style={styles.label}>{t('addExercise.name')}</Text>
            <TextInput
              value={form.name}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, name: text }))
              }
              placeholder={t('addExercise.namePlaceholder')}
              placeholderTextColor={tokens.colors.textMuted}
              style={styles.input}
              testID={E2E_IDS.exerciseModal.name}
            />

            <Text style={styles.label}>{t('addExercise.muscleGroup')}</Text>
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
                    testID={E2E_IDS.exerciseModal.muscleGroup(muscle)}
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
                <Text style={styles.label}>{t('addExercise.sets')}</Text>
                <TextInput
                  value={form.sets}
                  onChangeText={(text) =>
                    setForm((prev) => ({ ...prev, sets: text }))
                  }
                  keyboardType="numeric"
                  style={styles.input}
                  testID={E2E_IDS.exerciseModal.sets}
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>{t('addExercise.reps')}</Text>
                <TextInput
                  value={form.reps}
                  onChangeText={(text) =>
                    setForm((prev) => ({ ...prev, reps: text }))
                  }
                  style={styles.input}
                  testID={E2E_IDS.exerciseModal.reps}
                />
              </View>
            </View>

            <Text style={styles.label}>{t('addExercise.notes')}</Text>
            <TextInput
              value={form.notes}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, notes: text }))
              }
              style={[styles.input, styles.textarea]}
              placeholder={t('addExercise.notesPlaceholder')}
              placeholderTextColor={tokens.colors.textMuted}
              multiline
              testID={E2E_IDS.exerciseModal.notes}
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={styles.submitButton}
              onPress={handleSubmit}
              testID={E2E_IDS.exerciseModal.submit}
            >
              <Text style={styles.submitText}>
                {t('addExercise.submitEdit')}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </AnimatedModalShell>
    );
  }

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
          {mode === 'add'
            ? t('addExercise.titleAdd')
            : t('addExercise.titleEdit')}
        </Text>
        <Pressable
          style={styles.closeButton}
          onPress={onClose}
          testID={E2E_IDS.exerciseModal.close}
          hitSlop={8}
        >
          <X size={18} color={tokens.colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Text style={styles.label}>{t('addExercise.name')}</Text>
        <TextInput
          value={form.name}
          onChangeText={(text) => setForm((prev) => ({ ...prev, name: text }))}
          placeholder={t('addExercise.namePlaceholder')}
          placeholderTextColor={tokens.colors.textMuted}
          style={styles.input}
          testID={E2E_IDS.exerciseModal.name}
        />

        <Text style={styles.label}>{t('addExercise.muscleGroup')}</Text>
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
                testID={E2E_IDS.exerciseModal.muscleGroup(muscle)}
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
            <Text style={styles.label}>{t('addExercise.sets')}</Text>
            <TextInput
              value={form.sets}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, sets: text }))
              }
              keyboardType="numeric"
              style={styles.input}
              testID={E2E_IDS.exerciseModal.sets}
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>{t('addExercise.reps')}</Text>
            <TextInput
              value={form.reps}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, reps: text }))
              }
              style={styles.input}
              testID={E2E_IDS.exerciseModal.reps}
            />
          </View>
        </View>

        <Text style={styles.label}>{t('addExercise.notes')}</Text>
        <TextInput
          value={form.notes}
          onChangeText={(text) => setForm((prev) => ({ ...prev, notes: text }))}
          style={[styles.input, styles.textarea]}
          placeholder={t('addExercise.notesPlaceholder')}
          placeholderTextColor={tokens.colors.textMuted}
          multiline
          testID={E2E_IDS.exerciseModal.notes}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={styles.submitButton}
          onPress={handleSubmit}
          testID={E2E_IDS.exerciseModal.submit}
        >
          <Text style={styles.submitText}>
            {mode === 'add'
              ? t('addExercise.submitAdd')
              : t('addExercise.submitEdit')}
          </Text>
        </Pressable>
      </ScrollView>
    </AnimatedModalShell>
  );
}

function createStyles(
  tokens: ThemeTokens,
  layout: ReturnType<typeof useResponsiveLayout>,
) {
  return StyleSheet.create({
    modalRoot: {
      paddingHorizontal: tokens.spacing.lg,
    },
    tabletPanelModalRoot: {
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0, 0, 0, 0.58)',
    },
    tabletPanelBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0, 0, 0, 0.34)',
    },
    sheet: {
      width: '100%',
      maxWidth: layout.isTablet ? Math.min(layout.modalMaxWidth, 680) : 560,
      maxHeight: '86%',
      backgroundColor: tokens.colors.surfaceContainer,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: tokens.spacing.lg,
      paddingBottom: tokens.spacing.md,
    },
    tabletPanelSheet: {
      width: layout.isLandscape ? 460 : 400,
      height: '100%',
      overflow: 'hidden',
      borderTopLeftRadius: tokens.radius.xl,
      borderBottomLeftRadius: tokens.radius.xl,
    },
    tabletPanel: {
      flex: 1,
      backgroundColor: tokens.colors.surfaceContainer,
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: tokens.spacing.xl,
      paddingBottom: tokens.spacing.md,
      borderTopLeftRadius: tokens.radius.xl,
      borderBottomLeftRadius: tokens.radius.xl,
      borderLeftWidth: 1,
      borderLeftColor: tokens.colors.outlineVariant,
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
      flexWrap: layout.isTablet ? 'wrap' : 'nowrap',
    },
    col: {
      flex: 1,
      gap: tokens.spacing.xs,
      minWidth: layout.isTablet ? 220 : 0,
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
