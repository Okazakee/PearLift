import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AnimatedModalShell } from '@/components/AnimatedModalShell';
import { getRecentWorkoutSessionLogs } from '@/screens/workout/services';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import type {
  Exercise,
  ExerciseWeightMode,
  UserExerciseSettings,
  WeightUnit,
} from '@/types';
import {
  buildUserExerciseSettings,
  EXERCISE_WEIGHT_MODES,
  formatExerciseSettingInputValue,
  getWeightModeLabel,
} from '@/utils/exerciseSettings';
import { formatWeight, formatWeightUnit, toDisplayWeight } from '@/utils/units';
import type { ExerciseHistorySummary } from '@/utils/workoutLog';
import { getExerciseHistorySummary } from '@/utils/workoutLog';
import { Text, TextInput } from '../AppText';

interface ExerciseSettingsModalProps {
  open: boolean;
  tokens: ThemeTokens;
  exercise: Exercise | null;
  weightUnit: WeightUnit;
  initialSettings?: UserExerciseSettings | null;
  onClose: () => void;
  onSave: (settings: UserExerciseSettings) => void;
}

export function ExerciseSettingsModal({
  open,
  tokens,
  exercise,
  weightUnit,
  initialSettings,
  onClose,
  onSave,
}: ExerciseSettingsModalProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [workingWeight, setWorkingWeight] = useState('');
  const [incrementKg, setIncrementKg] = useState('');
  const [estimatedOneRepMax, setEstimatedOneRepMax] = useState('');
  const [weightMode, setWeightMode] = useState<ExerciseWeightMode>('total');
  const [notes, setNotes] = useState('');
  const [includeLinkedVariants, setIncludeLinkedVariants] = useState(false);
  const [history, setHistory] = useState<ExerciseHistorySummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setWorkingWeight(
      formatExerciseSettingInputValue(
        initialSettings?.workingWeight,
        weightUnit,
      ),
    );
    setIncrementKg(
      initialSettings?.incrementKg != null
        ? String(initialSettings.incrementKg)
        : '',
    );
    setEstimatedOneRepMax(
      formatExerciseSettingInputValue(
        initialSettings?.estimatedOneRepMax,
        weightUnit,
      ),
    );
    setWeightMode(initialSettings?.weightMode ?? 'total');
    setNotes(initialSettings?.notes ?? '');
    setIncludeLinkedVariants(false);
  }, [initialSettings, open, weightUnit]);

  useEffect(() => {
    if (!open || !exercise) {
      setHistory([]);
      setHistoryLoading(false);
      setHistoryError(false);
      return;
    }

    let active = true;
    setHistoryLoading(true);
    setHistoryError(false);

    // ponytail: scan recent logs in memory; add an exercise_id index if history grows large.
    void getRecentWorkoutSessionLogs()
      .then((logs) => {
        if (!active) {
          return;
        }
        const next = logs
          .map((log) =>
            getExerciseHistorySummary(log, exercise, includeLinkedVariants),
          )
          .filter((item): item is ExerciseHistorySummary => item !== null)
          .slice(0, 6);
        setHistory(next);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setHistory([]);
        setHistoryError(true);
      })
      .finally(() => {
        if (active) {
          setHistoryLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [exercise, includeLinkedVariants, open]);

  if (!exercise) {
    return null;
  }

  function formatHistoryDate(value: string) {
    return value.length >= 10 ? value.slice(0, 10) : value;
  }

  return (
    <AnimatedModalShell
      open={open}
      onClose={onClose}
      sheetStyle={styles.sheet}
      backdropStyle={styles.backdrop}
      containerStyle={styles.root}
    >
      <Text style={styles.title}>{t('exerciseSettings.title')}</Text>
      <Text style={styles.subtitle}>
        {t('exerciseSettings.subtitle', { exercise: exercise.name })}
      </Text>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>{t('exerciseSettings.workingWeight')}</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={workingWeight}
            onChangeText={setWorkingWeight}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          <Text style={styles.unitText}>{formatWeightUnit(weightUnit)}</Text>
        </View>

        <Text style={styles.label}>{t('exerciseSettings.weightMode')}</Text>
        <View style={styles.modeRow}>
          {EXERCISE_WEIGHT_MODES.map((mode) => (
            <Pressable
              key={mode}
              style={[
                styles.modeChip,
                weightMode === mode && styles.modeChipActive,
              ]}
              onPress={() => setWeightMode(mode)}
            >
              <Text
                style={[
                  styles.modeChipText,
                  weightMode === mode && styles.modeChipTextActive,
                ]}
              >
                {getWeightModeLabel(mode)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>{t('exerciseSettings.increment')}</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={incrementKg}
            onChangeText={setIncrementKg}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          <Text style={styles.unitText}>kg</Text>
        </View>

        <Text style={styles.label}>
          {t('exerciseSettings.estimatedOneRepMax')}
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            value={estimatedOneRepMax}
            onChangeText={setEstimatedOneRepMax}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          <Text style={styles.unitText}>{formatWeightUnit(weightUnit)}</Text>
        </View>

        <Text style={styles.label}>{t('exerciseSettings.notes')}</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          style={[styles.input, styles.notesInput]}
          multiline
        />

        <View style={styles.historySection}>
          <Text style={styles.label}>{t('exerciseSettings.history')}</Text>
          {exercise.canonicalExerciseId ? (
            <Pressable
              style={[
                styles.modeChip,
                includeLinkedVariants && styles.modeChipActive,
              ]}
              onPress={() => setIncludeLinkedVariants((value) => !value)}
            >
              <Text
                style={[
                  styles.modeChipText,
                  includeLinkedVariants && styles.modeChipTextActive,
                ]}
              >
                {t('exerciseSettings.linkedVariants')}
              </Text>
            </Pressable>
          ) : null}
          {historyLoading ? (
            <Text style={styles.historyEmpty}>
              {t('exerciseSettings.historyLoading')}
            </Text>
          ) : historyError ? (
            <Text style={styles.historyEmpty}>
              {t('exerciseSettings.historyError')}
            </Text>
          ) : history.length === 0 ? (
            <Text style={styles.historyEmpty}>
              {t('exerciseSettings.historyEmpty')}
            </Text>
          ) : (
            history.map((item) => (
              <View key={item.workoutLogId} style={styles.historyCard}>
                <Text style={styles.historyTitle}>
                  {item.variantLabel ?? item.exerciseName} · {item.workoutName}
                </Text>
                <Text style={styles.historyMeta}>
                  {formatHistoryDate(item.performedAt)}
                </Text>
                <Text style={styles.historyMeta}>
                  {[
                    item.loggedWeightKg != null
                      ? `${formatWeight(
                          toDisplayWeight(item.loggedWeightKg, weightUnit),
                          weightUnit,
                        )} ${formatWeightUnit(weightUnit)}`
                      : null,
                    t('exerciseSettings.historySets', {
                      completed: item.completedSets,
                      total: item.totalSets,
                    }),
                    item.bestReps != null
                      ? t('exerciseSettings.historyBestReps', {
                          reps: item.bestReps,
                        })
                      : null,
                  ]
                    .filter((part): part is string => part != null)
                    .join(' · ')}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.actionsRow}>
        <Pressable style={styles.cancelButton} onPress={onClose}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable
          style={styles.saveButton}
          onPress={() => {
            const settings = buildUserExerciseSettings({
              exerciseId: exercise.id,
              workingWeight,
              incrementKg,
              estimatedOneRepMax,
              notes,
              current: initialSettings,
              weightMode,
              weightUnit,
              updatedAt: new Date().toISOString(),
            });
            if (settings) {
              onSave(settings);
            }
            onClose();
          }}
        >
          <Text style={styles.saveText}>{t('common.save')}</Text>
        </Pressable>
      </View>
    </AnimatedModalShell>
  );
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    root: {
      paddingHorizontal: tokens.spacing.lg,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.58)',
    },
    sheet: {
      width: '100%',
      maxWidth: 560,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.md,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
    },
    subtitle: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
    },
    content: {
      gap: tokens.spacing.sm,
    },
    historySection: {
      gap: tokens.spacing.xs,
      marginTop: tokens.spacing.sm,
    },
    historyCard: {
      gap: 4,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.bgSurface,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
    },
    historyTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
    historyMeta: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    historyEmpty: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    label: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    input: {
      flex: 1,
      minHeight: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.bgSurface,
      paddingHorizontal: tokens.spacing.md,
      color: tokens.colors.textPrimary,
    },
    notesInput: {
      minHeight: 88,
      paddingTop: tokens.spacing.md,
      textAlignVertical: 'top',
    },
    unitText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
    },
    modeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing.sm,
    },
    modeChip: {
      borderRadius: tokens.radius.pill,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.bgSurface,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.xs,
    },
    modeChipActive: {
      backgroundColor: withAlpha(tokens.colors.primary, 0.14),
      borderColor: withAlpha(tokens.colors.primary, 0.4),
    },
    modeChipText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    modeChipTextActive: {
      color: tokens.colors.primary,
    },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: tokens.spacing.sm,
    },
    cancelButton: {
      minHeight: 40,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.bgSurface,
      paddingHorizontal: tokens.spacing.md,
    },
    cancelText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
    saveButton: {
      minHeight: 40,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      paddingHorizontal: tokens.spacing.md,
    },
    saveText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
  });
}
