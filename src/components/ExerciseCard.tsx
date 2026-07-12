import {
  Dumbbell,
  Edit2,
  Minus,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react-native';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import { E2E_IDS } from '@/config/testIds';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import type { Exercise, UserExerciseSettings, WeightUnit } from '@/types';
import {
  formatPerSetTargetSummary,
  formatProgressionRuleChipLabel,
  formatRepsLabel,
  formatWeekOverrideSummary,
} from '@/utils/exerciseAdvanced';
import {
  formatExerciseSettingValueLabel,
  getIntensityRangeLabel,
  getWeightModeLabel,
} from '@/utils/exerciseSettings';
import { getActiveWeekOverride } from '@/utils/exerciseTargets';
import { formatSeconds } from '@/utils/timerHelpers';
import {
  formatWeight,
  formatWeightUnit,
  fromDisplayWeight,
  getWeightStep,
  removeLoadModifier,
  toDisplayWeight,
} from '@/utils/units';
import { Text, TextInput } from './AppText';

interface ExerciseCardProps {
  tokens: ThemeTokens;
  exercise: Exercise;
  sourceExercise?: Exercise;
  currentWeek: number;
  weightUnit: WeightUnit;
  exerciseSettings?: UserExerciseSettings | null;
  restSeconds: number;
  showRestChip: boolean;
  loadModifier: number;
  adjustedWeight: number;
  onApplyRestPreset: (restSeconds: number) => void;
  onAdjustWeight: (exerciseId: string, delta: number) => void;
  onSetWeight: (exerciseId: string, value: number) => void;
  onEditExercise: (exercise: Exercise) => void;
  onDeleteExercise: (exercise: Exercise) => void;
  onOpenExerciseSettings: (exercise: Exercise) => void;
}

function formatRestChip(restSeconds: number): string {
  return `Rest ${formatSeconds(restSeconds)}`;
}

function ExerciseCardComponent({
  tokens,
  exercise,
  sourceExercise,
  currentWeek,
  weightUnit,
  exerciseSettings = null,
  restSeconds,
  showRestChip,
  loadModifier,
  adjustedWeight,
  onApplyRestPreset,
  onAdjustWeight,
  onSetWeight,
  onEditExercise,
  onDeleteExercise,
  onOpenExerciseSettings,
}: ExerciseCardProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const setsRepsLabel = `${exercise.sets}x${formatRepsLabel(
    exercise.reps,
    exercise.advanced?.unilateral,
  )}`;
  const [editingWeight, setEditingWeight] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const adjustedDisplayWeight = toDisplayWeight(adjustedWeight, weightUnit);
  const [tempWeight, setTempWeight] = useState(
    formatWeight(adjustedDisplayWeight, weightUnit),
  );
  const submitGuardRef = useRef(false);
  const restChip = formatRestChip(restSeconds);
  const intensityChip = exercise.advanced?.intensity?.label ?? null;
  const rirChip = exercise.advanced?.rir?.label
    ? `RIR ${exercise.advanced.rir.label}`
    : null;
  const progressionChip = formatProgressionRuleChipLabel(
    exercise.advanced?.progressionRule,
  );
  const step = getWeightStep(adjustedDisplayWeight, weightUnit);
  const configuredWeekOverrides =
    sourceExercise?.advanced?.weekOverrides ?? exercise.advanced?.weekOverrides;
  const activeWeekOverride = useMemo(
    () => getActiveWeekOverride(sourceExercise ?? exercise, currentWeek),
    [currentWeek, exercise, sourceExercise],
  );
  const displayStep =
    exerciseSettings?.incrementKg != null
      ? toDisplayWeight(exerciseSettings.incrementKg, weightUnit)
      : step;
  const intensityRangeLabel = getIntensityRangeLabel({
    intensity: exercise.advanced?.intensity ?? null,
    settings: exerciseSettings,
    weightUnit,
  });
  const generalNotes = exercise.notes.trim();
  const techniqueNotes = exercise.advanced?.technicalNotes ?? [];
  const executionCues = exercise.advanced?.executionCues ?? [];
  const targetSummary = [
    setsRepsLabel,
    `${formatWeight(adjustedDisplayWeight, weightUnit)} ${formatWeightUnit(
      weightUnit,
    )}`,
    rirChip,
    showRestChip ? restChip : null,
  ]
    .filter((item): item is string => item != null && item.length > 0)
    .join(' · ');
  const estimatedOneRepMaxLabel = formatExerciseSettingValueLabel(
    exerciseSettings?.estimatedOneRepMax,
    weightUnit,
  );
  const hasDetails =
    generalNotes.length > 0 ||
    techniqueNotes.length > 0 ||
    executionCues.length > 0 ||
    !!exercise.advanced?.intensity ||
    !!exercise.advanced?.tempo ||
    !!exercise.advanced?.progressionRule?.label ||
    !!exerciseSettings ||
    !!estimatedOneRepMaxLabel ||
    !!intensityRangeLabel ||
    !!exercise.advanced?.equipment ||
    !!exercise.advanced?.primaryMuscles?.length ||
    !!exercise.advanced?.secondaryMuscles?.length ||
    !!exercise.advanced?.perSetTargets?.length ||
    !!configuredWeekOverrides?.length;
  const handleWeightAdjust = useCallback(
    (direction: -1 | 1) => {
      const deltaKg = removeLoadModifier(
        fromDisplayWeight(direction * displayStep, weightUnit),
        loadModifier,
      );
      onAdjustWeight(exercise.id, deltaKg);
    },
    [displayStep, exercise.id, loadModifier, onAdjustWeight, weightUnit],
  );

  const handleWeightSubmit = useCallback(() => {
    if (submitGuardRef.current) return;
    submitGuardRef.current = true;
    const parsed = Number(tempWeight);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEditingWeight(false);
      setTempWeight(formatWeight(adjustedDisplayWeight, weightUnit));
      submitGuardRef.current = false;
      return;
    }
    onSetWeight(
      exercise.id,
      removeLoadModifier(fromDisplayWeight(parsed, weightUnit), loadModifier),
    );
    setEditingWeight(false);
    submitGuardRef.current = false;
  }, [
    adjustedDisplayWeight,
    exercise.id,
    loadModifier,
    onSetWeight,
    tempWeight,
    weightUnit,
  ]);

  const handleEdit = useCallback(() => {
    onEditExercise(sourceExercise ?? exercise);
  }, [exercise, onEditExercise, sourceExercise]);

  const handleDelete = useCallback(() => {
    onDeleteExercise(sourceExercise ?? exercise);
  }, [exercise, onDeleteExercise, sourceExercise]);

  const handleOpenSettings = useCallback(() => {
    onOpenExerciseSettings(sourceExercise ?? exercise);
  }, [exercise, onOpenExerciseSettings, sourceExercise]);

  return (
    <AnimatedPressable
      style={styles.card}
      pressScale={1}
      testID={E2E_IDS.exercise.card(exercise.id)}
    >
      <View style={styles.topRow}>
        <Text style={styles.name}>{exercise.name}</Text>
        <View style={styles.topActions}>
          <AnimatedPressable
            style={[styles.iconButton, styles.iconButtonEdit]}
            onPress={handleOpenSettings}
            testID={E2E_IDS.exercise.settings(exercise.id)}
          >
            <Settings2 size={16} color={tokens.colors.primary} />
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.iconButton, styles.iconButtonEdit]}
            onPress={handleEdit}
            testID={E2E_IDS.exercise.edit(exercise.id)}
          >
            <Edit2 size={16} color={tokens.colors.textSecondary} />
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.iconButton, styles.iconButtonDelete]}
            onPress={handleDelete}
            testID={E2E_IDS.exercise.delete(exercise.id)}
          >
            <Trash2 size={17} color={tokens.colors.error} />
          </AnimatedPressable>
        </View>
      </View>

      <View style={styles.chipsRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{exercise.muscleGroup}</Text>
        </View>
        {intensityChip && (
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText}>{intensityChip}</Text>
          </View>
        )}
        {progressionChip && (
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText}>{progressionChip}</Text>
          </View>
        )}
      </View>

      <AnimatedPressable
        style={styles.summaryRow}
        onPress={() => {
          if (showRestChip) {
            onApplyRestPreset(restSeconds);
          }
        }}
        disabled={!showRestChip}
      >
        <Text style={styles.summaryText}>{targetSummary}</Text>
      </AnimatedPressable>

      {hasDetails ? (
        <AnimatedPressable
          style={styles.detailsToggle}
          onPress={() => setDetailsOpen((prev) => !prev)}
        >
          <Text style={styles.detailsToggleText}>
            {detailsOpen ? t('workout.hideDetails') : t('workout.showDetails')}
          </Text>
        </AnimatedPressable>
      ) : null}

      {detailsOpen ? (
        <View style={styles.detailsSection}>
          {generalNotes.length > 0 ? (
            <View style={styles.detailGroup}>
              <Text style={styles.detailLabel}>
                {t('workout.details.notes')}
              </Text>
              <Text style={styles.detailText}>- {generalNotes}</Text>
            </View>
          ) : null}
          {techniqueNotes.length ? (
            <View style={styles.detailGroup}>
              <Text style={styles.detailLabel}>
                {t('workout.details.technique')}
              </Text>
              {techniqueNotes.map((item) => (
                <Text
                  key={`${exercise.id}:technique:${item}`}
                  style={styles.detailText}
                >
                  - {item}
                </Text>
              ))}
            </View>
          ) : null}
          {executionCues.length ? (
            <View style={styles.detailGroup}>
              <Text style={styles.detailLabel}>
                {t('workout.details.cues')}
              </Text>
              {executionCues.map((item) => (
                <Text
                  key={`${exercise.id}:cue:${item}`}
                  style={styles.detailText}
                >
                  - {item}
                </Text>
              ))}
            </View>
          ) : null}
          {exercise.advanced?.tempo ? (
            <View style={styles.detailGroup}>
              <Text style={styles.detailLabel}>
                {t('workout.details.tempo')}
              </Text>
              <Text style={styles.detailText}>{exercise.advanced.tempo}</Text>
            </View>
          ) : null}
          {exercise.advanced?.equipment ? (
            <View style={styles.detailGroup}>
              <Text style={styles.detailLabel}>
                {t('workout.details.equipment')}
              </Text>
              <Text style={styles.detailText}>
                {exercise.advanced.equipment}
              </Text>
            </View>
          ) : null}
          {exercise.advanced?.primaryMuscles?.length ? (
            <View style={styles.detailGroup}>
              <Text style={styles.detailLabel}>
                {t('workout.details.primaryMuscles')}
              </Text>
              <Text style={styles.detailText}>
                {exercise.advanced.primaryMuscles.join(', ')}
              </Text>
            </View>
          ) : null}
          {exercise.advanced?.secondaryMuscles?.length ? (
            <View style={styles.detailGroup}>
              <Text style={styles.detailLabel}>
                {t('workout.details.secondaryMuscles')}
              </Text>
              <Text style={styles.detailText}>
                {exercise.advanced.secondaryMuscles.join(', ')}
              </Text>
            </View>
          ) : null}
          {exercise.advanced?.perSetTargets?.length ? (
            <View style={styles.detailGroup}>
              <Text style={styles.detailLabel}>
                {t('workout.details.perSetTargets')}
              </Text>
              {exercise.advanced.perSetTargets.map((item) => (
                <Text
                  key={`${exercise.id}:set-target:${item.setNumber}`}
                  style={styles.detailText}
                >
                  {formatPerSetTargetSummary(
                    item,
                    exercise.advanced?.unilateral,
                  )}
                </Text>
              ))}
            </View>
          ) : null}
          {exercise.advanced?.progressionRule?.label ? (
            <View style={styles.detailGroup}>
              <Text style={styles.detailLabel}>
                {t('workout.details.progression')}
              </Text>
              <Text style={styles.detailText}>
                {exercise.advanced.progressionRule.label}
              </Text>
            </View>
          ) : null}
          {configuredWeekOverrides?.length ? (
            <View style={styles.detailGroup}>
              <Text style={styles.detailLabel}>
                {t('workout.details.weekOverrides')}
              </Text>
              {configuredWeekOverrides.map((item) => (
                <Text
                  key={`${exercise.id}:week-override:${item.week}`}
                  style={styles.detailText}
                >
                  {formatWeekOverrideSummary(item)}
                  {activeWeekOverride?.week === item.week
                    ? ` · ${t('workout.details.active')}`
                    : ''}
                </Text>
              ))}
            </View>
          ) : null}
          {exercise.advanced?.intensity || exerciseSettings ? (
            <View style={styles.detailGroup}>
              <Text style={styles.detailLabel}>
                {t('workout.details.intensity')}
              </Text>
              {exercise.advanced?.intensity?.label ? (
                <Text style={styles.detailText}>
                  {t('workout.details.target')}:{' '}
                  {exercise.advanced.intensity.label}
                </Text>
              ) : null}
              <Text style={styles.detailText}>
                {t('workout.details.estimatedOneRepMax')}:{' '}
                {estimatedOneRepMaxLabel ?? t('workout.details.notSet')}
              </Text>
              {intensityRangeLabel ? (
                <Text style={styles.detailText}>
                  {t('workout.details.intensityRange')}: {intensityRangeLabel}
                </Text>
              ) : null}
            </View>
          ) : null}
          {exerciseSettings ? (
            <View style={styles.detailGroup}>
              <Text style={styles.detailLabel}>
                {t('workout.details.weightSettings')}
              </Text>
              <Text style={styles.detailText}>
                {t('workout.details.weightMode')}:{' '}
                {getWeightModeLabel(exerciseSettings.weightMode)}
              </Text>
              {exerciseSettings.incrementKg != null ? (
                <Text style={styles.detailText}>
                  {t('workout.details.increment')}:{' '}
                  {exerciseSettings.incrementKg} kg
                </Text>
              ) : null}
            </View>
          ) : null}
          <AnimatedPressable
            style={styles.detailsSettingsButton}
            onPress={handleOpenSettings}
          >
            <Settings2 size={14} color={tokens.colors.primary} />
            <Text style={styles.detailsSettingsText}>
              {t('workout.details.exerciseSettings')}
            </Text>
          </AnimatedPressable>
        </View>
      ) : null}

      <View style={styles.weightControl}>
        <AnimatedPressable
          style={[styles.stepButton, styles.stepButtonMinus]}
          onPress={() => handleWeightAdjust(-1)}
          testID={E2E_IDS.exercise.decrement(exercise.id)}
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
              testID={E2E_IDS.exercise.weightInput(exercise.id)}
            />
            <Text style={styles.weightUnit}>
              {formatWeightUnit(weightUnit)}
            </Text>
          </View>
        ) : (
          <AnimatedPressable
            style={styles.weightValueRow}
            onPress={() => {
              setTempWeight(formatWeight(adjustedDisplayWeight, weightUnit));
              setEditingWeight(true);
            }}
            testID={E2E_IDS.exercise.weightValue(exercise.id)}
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
          testID={E2E_IDS.exercise.increment(exercise.id)}
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
    prev.loadModifier === next.loadModifier &&
    prev.adjustedWeight === next.adjustedWeight &&
    prev.restSeconds === next.restSeconds &&
    prev.showRestChip === next.showRestChip &&
    prev.exercise.id === next.exercise.id &&
    prev.exercise.name === next.exercise.name &&
    prev.exercise.muscleGroup === next.exercise.muscleGroup &&
    prev.exercise.notes === next.exercise.notes &&
    prev.exercise.sets === next.exercise.sets &&
    prev.exercise.reps === next.exercise.reps &&
    JSON.stringify(prev.exercise.advanced ?? null) ===
      JSON.stringify(next.exercise.advanced ?? null) &&
    prev.sourceExercise === next.sourceExercise &&
    prev.onApplyRestPreset === next.onApplyRestPreset,
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
    metaChip: {
      paddingHorizontal: tokens.spacing.sm + 6,
      paddingVertical: tokens.spacing.xs + 1,
      borderRadius: 14,
      backgroundColor: withAlpha(tokens.colors.textSecondary, 0.1),
    },
    metaChipText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '500',
    },
    summaryRow: {
      alignSelf: 'flex-start',
    },
    summaryText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '600',
      lineHeight: 20,
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
    detailsToggle: {
      alignSelf: 'flex-start',
      borderRadius: tokens.radius.pill,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 6,
      backgroundColor: withAlpha(tokens.colors.primary, 0.1),
    },
    detailsToggleText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    detailsSection: {
      gap: tokens.spacing.xs,
      paddingTop: 2,
    },
    detailGroup: {
      gap: 4,
    },
    detailLabel: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    detailText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      lineHeight: 18,
    },
    detailsSettingsButton: {
      marginTop: tokens.spacing.xs,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
      borderRadius: tokens.radius.pill,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 6,
      backgroundColor: withAlpha(tokens.colors.primary, 0.1),
    },
    detailsSettingsText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.label,
      fontWeight: '700',
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
