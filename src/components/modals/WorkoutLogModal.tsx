import { Check, ClipboardList, RotateCcw, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { E2E_IDS } from '@/config/testIds';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import type {
  LoggedSet,
  TrainingProgram,
  UnilateralPrescription,
  WeightUnit,
  WorkoutSession,
  WorkoutSessionLog,
} from '@/types';
import {
  formatRepsLabel,
  inferUnilateralFromRepsLabel,
} from '@/utils/exerciseAdvanced';
import { formatSeconds } from '@/utils/timerHelpers';
import {
  formatWeight,
  formatWeightUnit,
  fromDisplayWeight,
  toDisplayWeight,
} from '@/utils/units';
import {
  buildWorkoutSessionLog,
  countLoggedWorkoutSets,
  finalizeWorkoutSession,
  getEffectiveLoggedReps,
  getQuickCompleteReps,
  hasExplicitExerciseRirTarget,
} from '@/utils/workoutLog';
import { Text, TextInput } from '../AppText';

interface WorkoutLogModalProps {
  open: boolean;
  tokens: ThemeTokens;
  workout: WorkoutSession;
  program?: TrainingProgram | null;
  currentWeek: number;
  weekRir?: number | null;
  restDuration: number;
  weightUnit: WeightUnit;
  getAdjustedWeight: (exerciseId: string, weekId?: number) => number;
  onClose: () => void;
  onSave: (log: WorkoutSessionLog) => Promise<void>;
}

const RIR_OPTIONS = [0, 1, 2, 3, 4] as const;

function formatTargetRir(value: LoggedSet['targetRir']) {
  if (value == null) {
    return null;
  }
  return typeof value === 'number' ? String(value) : value;
}

function formatExerciseTargetMeta(input: {
  sets?: number;
  reps?: string;
  plannedWeight?: number;
  targetRir?: LoggedSet['targetRir'];
  restSeconds?: number;
  weightUnit: WeightUnit;
}) {
  const parts = [
    input.sets != null && input.reps ? `${input.sets}x${input.reps}` : null,
    input.plannedWeight != null
      ? `${formatWeight(
          toDisplayWeight(input.plannedWeight, input.weightUnit),
          input.weightUnit,
        )} ${formatWeightUnit(input.weightUnit)}`
      : null,
    input.targetRir != null ? `RIR ${formatTargetRir(input.targetRir)}` : null,
    input.restSeconds != null
      ? `Rest ${formatSeconds(input.restSeconds)}`
      : null,
  ].filter((item): item is string => item != null);

  return parts.join(' · ');
}

function formatActualRepsLabel(
  targetRepsLabel: string | undefined,
  unilateral: UnilateralPrescription | undefined,
  fallback: string,
) {
  const resolvedUnilateral =
    unilateral ?? inferUnilateralFromRepsLabel(targetRepsLabel ?? '');
  if (!resolvedUnilateral) {
    return fallback;
  }

  if (resolvedUnilateral.sideMode === 'per_leg') {
    return `${fallback} / leg`;
  }

  if (
    resolvedUnilateral.sideMode === 'per_side' ||
    resolvedUnilateral.sideMode === 'left_right'
  ) {
    return `${fallback} / side`;
  }

  return fallback;
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function isPerSideExercise(
  targetRepsLabel: string | undefined,
  unilateral: UnilateralPrescription | undefined,
) {
  return Boolean(
    unilateral?.enabled || inferUnilateralFromRepsLabel(targetRepsLabel ?? ''),
  );
}

export function WorkoutLogModal({
  open,
  tokens,
  workout,
  program = null,
  currentWeek,
  weekRir = null,
  restDuration,
  weightUnit,
  getAdjustedWeight,
  onClose,
  onSave,
}: WorkoutLogModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [draft, setDraft] = useState<WorkoutSessionLog | null>(null);
  const [perSideSetKeys, setPerSideSetKeys] = useState<Record<string, true>>(
    {},
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setPerSideSetKeys({});
      setSaving(false);
      return;
    }

    setPerSideSetKeys({});
    setDraft(
      buildWorkoutSessionLog({
        workout,
        program,
        currentWeek,
        weekRir,
        settingsRestSeconds: restDuration,
        getAdjustedWeight,
      }),
    );
  }, [
    open,
    workout,
    program,
    currentWeek,
    weekRir,
    restDuration,
    getAdjustedWeight,
  ]);

  const progress = useMemo(
    () => (draft ? countLoggedWorkoutSets(draft) : null),
    [draft],
  );
  const explicitRirExerciseIds = useMemo(
    () =>
      new Set(
        workout.exercises
          .filter((exercise) => hasExplicitExerciseRirTarget(exercise))
          .map((exercise) => exercise.id),
      ),
    [workout.exercises],
  );

  function buildSetKey(exerciseId: string, setNumber: number) {
    return `${exerciseId}:${setNumber}`;
  }

  function updateSet(
    exerciseId: string,
    setNumber: number,
    updater: (set: LoggedSet) => LoggedSet,
  ) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        exerciseLogs: current.exerciseLogs.map((exerciseLog) =>
          exerciseLog.exerciseId !== exerciseId
            ? exerciseLog
            : {
                ...exerciseLog,
                sets: exerciseLog.sets.map((set) =>
                  set.setNumber === setNumber ? updater(set) : set,
                ),
              },
        ),
      };
    });
  }

  async function handleSave() {
    if (!draft || saving) {
      return;
    }

    setSaving(true);
    try {
      await onSave(finalizeWorkoutSession(draft));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatedScreenModal
      open={open}
      onClose={onClose}
      presentation="tablet-sheet"
      maxWidth={820}
      style={styles.screen}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <ClipboardList size={18} color={tokens.colors.primary} />
            <View style={styles.titleCopy}>
              <Text style={styles.title}>{t('workoutLog.title')}</Text>
              <Text style={styles.subtitle}>
                {t('workoutLog.subtitle', {
                  workout: workout.name,
                  week: currentWeek,
                })}
              </Text>
              {progress ? (
                <Text style={styles.progressText}>
                  {t('workoutLog.progress', progress)}
                </Text>
              ) : null}
            </View>
          </View>
          <AnimatedPressable
            style={styles.closeButton}
            onPress={onClose}
            testID={E2E_IDS.workoutLog.close}
          >
            <X size={18} color={tokens.colors.textSecondary} />
          </AnimatedPressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: layout.isTablet ? tokens.spacing.lg : 96 },
          ]}
        >
          {draft?.exerciseLogs.map((exerciseLog) => (
            <View key={exerciseLog.exerciseId} style={styles.exerciseCard}>
              <Text style={styles.exerciseName}>
                {exerciseLog.exerciseNameSnapshot}
              </Text>
              <Text style={styles.exerciseMeta}>
                {formatExerciseTargetMeta({
                  sets: exerciseLog.prescriptionSnapshot?.sets,
                  reps: exerciseLog.prescriptionSnapshot
                    ? formatRepsLabel(
                        exerciseLog.prescriptionSnapshot.reps,
                        exerciseLog.prescriptionSnapshot.advanced?.unilateral,
                      )
                    : undefined,
                  plannedWeight: exerciseLog.plannedWeight,
                  targetRir: exerciseLog.sets[0]?.targetRir,
                  restSeconds:
                    exerciseLog.prescriptionSnapshot?.advanced?.restSeconds,
                  weightUnit,
                })}
              </Text>

              {exerciseLog.sets.map((set) => (
                <View
                  key={`${exerciseLog.exerciseId}:${set.setNumber}`}
                  style={[
                    styles.setCard,
                    set.skipped
                      ? styles.setCardSkipped
                      : set.completed
                        ? styles.setCardCompleted
                        : null,
                  ]}
                >
                  {(() => {
                    const setKey = buildSetKey(
                      exerciseLog.exerciseId,
                      set.setNumber,
                    );
                    const unilateral =
                      exerciseLog.prescriptionSnapshot?.advanced?.unilateral;
                    const supportsPerSide = isPerSideExercise(
                      set.targetRepsLabel,
                      unilateral,
                    );
                    const showPerSideInputs =
                      supportsPerSide &&
                      (perSideSetKeys[setKey] === true ||
                        set.actualLeftReps != null ||
                        set.actualRightReps != null);
                    const showActualRir =
                      explicitRirExerciseIds.has(exerciseLog.exerciseId) ||
                      set.actualRir != null;

                    return (
                      <>
                        <View style={styles.setHeader}>
                          <Text style={styles.setTitle}>
                            {t('workoutLog.setLabel', { set: set.setNumber })}
                          </Text>
                          <Text style={styles.setMeta}>
                            {set.targetRepsLabel}
                            {set.targetRir != null
                              ? ` · RIR ${formatTargetRir(set.targetRir)}`
                              : ''}
                          </Text>
                        </View>

                        <View style={styles.inputRow}>
                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>
                              {t('workoutLog.actualWeight')}
                            </Text>
                            <TextInput
                              style={styles.input}
                              value={
                                set.actualWeight != null
                                  ? formatWeight(
                                      toDisplayWeight(
                                        set.actualWeight,
                                        weightUnit,
                                      ),
                                      weightUnit,
                                    )
                                  : ''
                              }
                              onChangeText={(value) =>
                                updateSet(
                                  exerciseLog.exerciseId,
                                  set.setNumber,
                                  (current) => ({
                                    ...current,
                                    actualWeight:
                                      parseOptionalNumber(value) != null
                                        ? fromDisplayWeight(
                                            parseOptionalNumber(value) ?? 0,
                                            weightUnit,
                                          )
                                        : undefined,
                                  }),
                                )
                              }
                              keyboardType="decimal-pad"
                            />
                          </View>
                          {showPerSideInputs ? (
                            <>
                              <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>
                                  {t('workoutLog.leftReps')}
                                </Text>
                                <TextInput
                                  style={styles.input}
                                  value={
                                    set.actualLeftReps != null
                                      ? String(set.actualLeftReps)
                                      : ''
                                  }
                                  onChangeText={(value) =>
                                    updateSet(
                                      exerciseLog.exerciseId,
                                      set.setNumber,
                                      (current) => ({
                                        ...current,
                                        actualReps: undefined,
                                        actualLeftReps:
                                          parseOptionalNumber(value),
                                      }),
                                    )
                                  }
                                  keyboardType="number-pad"
                                />
                              </View>
                              <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>
                                  {t('workoutLog.rightReps')}
                                </Text>
                                <TextInput
                                  style={styles.input}
                                  value={
                                    set.actualRightReps != null
                                      ? String(set.actualRightReps)
                                      : ''
                                  }
                                  onChangeText={(value) =>
                                    updateSet(
                                      exerciseLog.exerciseId,
                                      set.setNumber,
                                      (current) => ({
                                        ...current,
                                        actualReps: undefined,
                                        actualRightReps:
                                          parseOptionalNumber(value),
                                      }),
                                    )
                                  }
                                  keyboardType="number-pad"
                                />
                              </View>
                            </>
                          ) : (
                            <View style={styles.inputGroup}>
                              <Text style={styles.inputLabel}>
                                {formatActualRepsLabel(
                                  set.targetRepsLabel,
                                  unilateral,
                                  t('workoutLog.actualReps'),
                                )}
                              </Text>
                              <TextInput
                                style={styles.input}
                                value={
                                  set.actualReps != null
                                    ? String(set.actualReps)
                                    : ''
                                }
                                onChangeText={(value) =>
                                  updateSet(
                                    exerciseLog.exerciseId,
                                    set.setNumber,
                                    (current) => ({
                                      ...current,
                                      actualReps: parseOptionalNumber(value),
                                    }),
                                  )
                                }
                                keyboardType="number-pad"
                              />
                            </View>
                          )}
                        </View>

                        {supportsPerSide ? (
                          <AnimatedPressable
                            style={[
                              styles.modeToggle,
                              showPerSideInputs && styles.modeToggleActive,
                            ]}
                            onPress={() => {
                              if (showPerSideInputs) {
                                setPerSideSetKeys((current) => {
                                  const next = { ...current };
                                  delete next[setKey];
                                  return next;
                                });
                                updateSet(
                                  exerciseLog.exerciseId,
                                  set.setNumber,
                                  (current) => ({
                                    ...current,
                                    actualReps: getEffectiveLoggedReps(current),
                                    actualLeftReps: undefined,
                                    actualRightReps: undefined,
                                  }),
                                );
                                return;
                              }

                              setPerSideSetKeys((current) => ({
                                ...current,
                                [setKey]: true,
                              }));
                              updateSet(
                                exerciseLog.exerciseId,
                                set.setNumber,
                                (current) => {
                                  const reps = getEffectiveLoggedReps(current);
                                  return {
                                    ...current,
                                    actualReps: undefined,
                                    actualLeftReps:
                                      current.actualLeftReps ?? reps,
                                    actualRightReps:
                                      current.actualRightReps ?? reps,
                                  };
                                },
                              );
                            }}
                          >
                            <Text
                              style={[
                                styles.modeToggleText,
                                showPerSideInputs &&
                                  styles.modeToggleTextActive,
                              ]}
                            >
                              {showPerSideInputs
                                ? t('workoutLog.sharedReps')
                                : t('workoutLog.perSideReps')}
                            </Text>
                          </AnimatedPressable>
                        ) : null}

                        {showActualRir ? (
                          <View style={styles.rirGroup}>
                            <Text style={styles.inputLabel}>
                              {t('workoutLog.actualRir')}
                            </Text>
                            <View style={styles.rirOptionRow}>
                              {RIR_OPTIONS.map((value) => {
                                const active = set.actualRir === value;
                                return (
                                  <AnimatedPressable
                                    key={value}
                                    style={[
                                      styles.rirOptionButton,
                                      active && styles.rirOptionButtonActive,
                                    ]}
                                    onPress={() =>
                                      updateSet(
                                        exerciseLog.exerciseId,
                                        set.setNumber,
                                        (current) => ({
                                          ...current,
                                          actualRir: value,
                                        }),
                                      )
                                    }
                                    testID={E2E_IDS.workoutLog.setRir(
                                      exerciseLog.exerciseId,
                                      set.setNumber,
                                      String(value),
                                    )}
                                  >
                                    <Text
                                      style={[
                                        styles.rirOptionText,
                                        active && styles.rirOptionTextActive,
                                      ]}
                                    >
                                      {value}
                                    </Text>
                                  </AnimatedPressable>
                                );
                              })}
                              <AnimatedPressable
                                style={[
                                  styles.rirOptionButton,
                                  set.actualRir == null &&
                                    styles.rirOptionButtonActive,
                                ]}
                                onPress={() =>
                                  updateSet(
                                    exerciseLog.exerciseId,
                                    set.setNumber,
                                    (current) => ({
                                      ...current,
                                      actualRir: undefined,
                                    }),
                                  )
                                }
                                testID={E2E_IDS.workoutLog.setRir(
                                  exerciseLog.exerciseId,
                                  set.setNumber,
                                  'unknown',
                                )}
                              >
                                <Text
                                  style={[
                                    styles.rirOptionText,
                                    set.actualRir == null &&
                                      styles.rirOptionTextActive,
                                  ]}
                                >
                                  ?
                                </Text>
                              </AnimatedPressable>
                            </View>
                          </View>
                        ) : null}

                        <View style={styles.actionRow}>
                          <AnimatedPressable
                            style={styles.secondaryAction}
                            onPress={() =>
                              updateSet(
                                exerciseLog.exerciseId,
                                set.setNumber,
                                (current) => ({
                                  ...current,
                                  actualWeight:
                                    current.plannedWeight ??
                                    current.actualWeight,
                                  ...(showPerSideInputs
                                    ? {
                                        actualReps: undefined,
                                        actualLeftReps:
                                          getQuickCompleteReps(
                                            current.targetRepsLabel ?? '',
                                          ) ?? current.actualLeftReps,
                                        actualRightReps:
                                          getQuickCompleteReps(
                                            current.targetRepsLabel ?? '',
                                          ) ?? current.actualRightReps,
                                      }
                                    : {
                                        actualReps:
                                          getQuickCompleteReps(
                                            current.targetRepsLabel ?? '',
                                          ) ?? current.actualReps,
                                      }),
                                  ...(showActualRir && current.actualRir == null
                                    ? {
                                        actualRir:
                                          typeof current.targetRir === 'number'
                                            ? current.targetRir
                                            : current.actualRir,
                                      }
                                    : {}),
                                  completed: true,
                                  skipped: false,
                                }),
                              )
                            }
                            testID={E2E_IDS.workoutLog.setTarget(
                              exerciseLog.exerciseId,
                              set.setNumber,
                            )}
                          >
                            <Text style={styles.secondaryActionText}>
                              {t('workoutLog.useTarget')}
                            </Text>
                          </AnimatedPressable>
                          <AnimatedPressable
                            style={styles.secondaryAction}
                            onPress={() =>
                              updateSet(
                                exerciseLog.exerciseId,
                                set.setNumber,
                                (current) => ({
                                  ...current,
                                  actualWeight:
                                    current.actualWeight ??
                                    current.plannedWeight,
                                  completed:
                                    !current.completed ||
                                    Boolean(current.skipped),
                                  skipped: false,
                                }),
                              )
                            }
                            testID={E2E_IDS.workoutLog.setDone(
                              exerciseLog.exerciseId,
                              set.setNumber,
                            )}
                          >
                            <Check size={14} color={tokens.colors.success} />
                            <Text style={styles.secondaryActionText}>
                              {t('workoutLog.done')}
                            </Text>
                          </AnimatedPressable>
                          <AnimatedPressable
                            style={styles.secondaryAction}
                            onPress={() =>
                              updateSet(
                                exerciseLog.exerciseId,
                                set.setNumber,
                                (current) => ({
                                  ...current,
                                  completed: false,
                                  skipped: !current.skipped,
                                }),
                              )
                            }
                            testID={E2E_IDS.workoutLog.setSkip(
                              exerciseLog.exerciseId,
                              set.setNumber,
                            )}
                          >
                            <Text style={styles.secondaryActionText}>
                              {t('workoutLog.skip')}
                            </Text>
                          </AnimatedPressable>
                          <AnimatedPressable
                            style={styles.secondaryAction}
                            onPress={() =>
                              updateSet(
                                exerciseLog.exerciseId,
                                set.setNumber,
                                (current) => ({
                                  ...current,
                                  actualWeight: undefined,
                                  actualReps: undefined,
                                  actualLeftReps: undefined,
                                  actualRightReps: undefined,
                                  actualRir: undefined,
                                  completed: false,
                                  skipped: false,
                                }),
                              )
                            }
                          >
                            <RotateCcw
                              size={14}
                              color={tokens.colors.textSecondary}
                            />
                            <Text style={styles.secondaryActionText}>
                              {t('workoutLog.reset')}
                            </Text>
                          </AnimatedPressable>
                        </View>
                      </>
                    );
                  })()}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <AnimatedPressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.saveButton}
            onPress={() => {
              void handleSave();
            }}
            disabled={saving}
            testID={E2E_IDS.workoutLog.save}
          >
            <Text style={styles.saveText}>
              {saving ? t('workoutLog.saving') : t('workoutLog.save')}
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    </AnimatedScreenModal>
  );
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    screen: {
      backgroundColor: tokens.colors.bgBase,
    },
    container: {
      flex: 1,
      backgroundColor: tokens.colors.bgBase,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: tokens.spacing.xl,
      paddingBottom: tokens.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.outlineVariant,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm,
      flex: 1,
    },
    titleCopy: {
      flex: 1,
      gap: 2,
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
    progressText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(tokens.colors.textSecondary, 0.08),
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: tokens.spacing.lg,
      gap: tokens.spacing.md,
    },
    exerciseCard: {
      gap: tokens.spacing.sm,
      padding: tokens.spacing.md,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainer,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
    },
    exerciseName: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    exerciseMeta: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    setCard: {
      gap: tokens.spacing.sm,
      padding: tokens.spacing.sm,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.bgElevated,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
    },
    setCardCompleted: {
      borderColor: withAlpha(tokens.colors.success, 0.4),
      backgroundColor: withAlpha(tokens.colors.success, 0.08),
    },
    setCardSkipped: {
      borderColor: withAlpha(tokens.colors.textSecondary, 0.24),
      backgroundColor: withAlpha(tokens.colors.textSecondary, 0.08),
    },
    setHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: tokens.spacing.sm,
    },
    setTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
    setMeta: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    inputRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      flexWrap: 'wrap',
    },
    inputGroup: {
      minWidth: 92,
      flex: 1,
      gap: 4,
    },
    modeToggle: {
      alignSelf: 'flex-start',
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs + 2,
      borderRadius: tokens.radius.pill,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHighest,
    },
    modeToggleActive: {
      borderColor: tokens.colors.primary,
      backgroundColor: withAlpha(tokens.colors.primary, 0.12),
    },
    modeToggleText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    modeToggleTextActive: {
      color: tokens.colors.primary,
    },
    rirGroup: {
      gap: tokens.spacing.xs,
    },
    rirOptionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing.xs,
    },
    rirOptionButton: {
      minWidth: 38,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs + 2,
      borderRadius: tokens.radius.pill,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHighest,
    },
    rirOptionButtonActive: {
      borderColor: tokens.colors.primary,
      backgroundColor: tokens.colors.primary,
    },
    rirOptionText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    rirOptionTextActive: {
      color: tokens.colors.onPrimary,
    },
    inputLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    input: {
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.sm,
      color: tokens.colors.textPrimary,
      backgroundColor: tokens.colors.surfaceContainerHighest,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing.xs,
    },
    secondaryAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs + 2,
      borderRadius: tokens.radius.pill,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHighest,
    },
    secondaryActionText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: tokens.spacing.sm,
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.md,
      borderTopWidth: 1,
      borderTopColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.bgBase,
    },
    cancelButton: {
      minWidth: 96,
      minHeight: 42,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
    },
    cancelText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
    saveButton: {
      minWidth: 148,
      minHeight: 42,
      borderRadius: tokens.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
      backgroundColor: tokens.colors.primary,
    },
    saveText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
  });
}
