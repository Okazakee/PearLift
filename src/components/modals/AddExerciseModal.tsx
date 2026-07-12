import { X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AnimatedModalShell } from '@/components/AnimatedModalShell';
import { E2E_IDS } from '@/config/testIds';
import { muscleGroups } from '@/data/workouts';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { createExerciseId } from '@/storage/repository/defaults';
import type { ThemeTokens } from '@/theme/tokens';
import type {
  Exercise,
  ExerciseWeightMode,
  UserExerciseSettings,
  WeightUnit,
} from '@/types';
import {
  formatPerSetTargetsInput,
  formatRepsLabel,
  formatRirInput,
  formatWeekOverridesInput,
  hasAdvancedExerciseEditorFields,
  parseIntensityInput,
  parseLineList,
  parsePerSetTargetsInput,
  parseProgressionRuleInput,
  parseRirInput,
  parseUnilateralInput,
  parseWeekOverridesInput,
} from '@/utils/exerciseAdvanced';
import {
  buildUserExerciseSettings,
  EXERCISE_WEIGHT_MODES,
  formatExerciseSettingInputValue,
  getWeightModeLabel,
} from '@/utils/exerciseSettings';
import { formatWeightUnit } from '@/utils/units';
import { Text, TextInput } from '../AppText';

interface FormExercise {
  name: string;
  canonicalExerciseId: string;
  muscleGroup: string;
  aliases: string;
  variantLabel: string;
  sessionSpecific: boolean;
  sets: string;
  reps: string;
  workingWeight: string;
  notes: string;
  restSeconds: string;
  rirLabel: string;
  intensityLabel: string;
  tempo: string;
  progressionRuleLabel: string;
  weightMode: ExerciseWeightMode;
  incrementKg: string;
  unilateralLabel: string;
  equipment: string;
  primaryMuscles: string;
  secondaryMuscles: string;
  technicalNotes: string;
  executionCues: string;
  perSetTargets: string;
  weekOverrides: string;
}

interface AddExerciseModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  tokens: ThemeTokens;
  weightUnit: WeightUnit;
  initialExercise?: Exercise | null;
  initialSettings?: UserExerciseSettings | null;
  onClose: () => void;
  onSubmit: (value: {
    exercise: Omit<Exercise, 'position' | 'baseWeight'>;
    settings: UserExerciseSettings | null;
  }) => void;
}

const blankState: FormExercise = {
  name: '',
  canonicalExerciseId: '',
  muscleGroup: 'Chest',
  aliases: '',
  variantLabel: '',
  sessionSpecific: false,
  sets: '2',
  reps: '8-10',
  workingWeight: '',
  notes: '',
  restSeconds: '',
  rirLabel: '',
  intensityLabel: '',
  tempo: '',
  progressionRuleLabel: '',
  weightMode: 'total',
  incrementKg: '',
  unilateralLabel: '',
  equipment: '',
  primaryMuscles: '',
  secondaryMuscles: '',
  technicalNotes: '',
  executionCues: '',
  perSetTargets: '',
  weekOverrides: '',
};

const REST_PRESETS = [
  { label: '60s', value: '60' },
  { label: '90s', value: '90' },
  { label: '2:00', value: '120' },
  { label: '2:30', value: '150' },
  { label: '3:00', value: '180' },
] as const;

const RIR_PRESETS = ['0', '1', '1-2', '2', '3'] as const;

const INTENSITY_PRESETS = ['70-75%', '75-80%', '80-85%', 'Control'] as const;

type EditorTab = 'basic' | 'advanced';

export function AddExerciseModal({
  open,
  mode,
  tokens,
  weightUnit,
  initialExercise,
  initialSettings,
  onClose,
  onSubmit,
}: AddExerciseModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const [form, setForm] = useState<FormExercise>(blankState);
  const [activeTab, setActiveTab] = useState<EditorTab>('basic');
  const [error, setError] = useState<string | null>(null);
  const resetKey = open ? `${mode}:${initialExercise?.id ?? 'new'}` : null;
  const prevResetKeyRef = useRef<string | null>(resetKey);
  const styles = useMemo(() => createStyles(tokens, layout), [tokens, layout]);

  if (resetKey !== prevResetKeyRef.current) {
    prevResetKeyRef.current = resetKey;
    if (mode === 'edit' && initialExercise) {
      setForm({
        name: initialExercise.name,
        canonicalExerciseId: initialExercise.canonicalExerciseId ?? '',
        muscleGroup: initialExercise.muscleGroup,
        aliases: initialExercise.aliases?.join('\n') ?? '',
        variantLabel: initialExercise.variantLabel ?? '',
        sessionSpecific: initialExercise.sessionSpecific === true,
        sets: String(initialExercise.sets),
        reps: initialExercise.reps,
        workingWeight: formatExerciseSettingInputValue(
          initialSettings?.workingWeight,
          weightUnit,
        ),
        notes: initialExercise.notes,
        restSeconds:
          initialExercise.advanced?.restSeconds != null
            ? String(initialExercise.advanced.restSeconds)
            : '',
        rirLabel: formatRirInput(initialExercise.advanced?.rir),
        intensityLabel: initialExercise.advanced?.intensity?.label ?? '',
        tempo: initialExercise.advanced?.tempo ?? '',
        progressionRuleLabel:
          initialExercise.advanced?.progressionRule?.label ?? '',
        weightMode: initialSettings?.weightMode ?? 'total',
        incrementKg:
          initialSettings?.incrementKg != null
            ? String(initialSettings.incrementKg)
            : '',
        unilateralLabel: initialExercise.advanced?.unilateral?.label ?? '',
        equipment: initialExercise.advanced?.equipment ?? '',
        primaryMuscles:
          initialExercise.advanced?.primaryMuscles?.join('\n') ?? '',
        secondaryMuscles:
          initialExercise.advanced?.secondaryMuscles?.join('\n') ?? '',
        technicalNotes:
          initialExercise.advanced?.technicalNotes?.join('\n') ?? '',
        executionCues:
          initialExercise.advanced?.executionCues?.join('\n') ?? '',
        perSetTargets: formatPerSetTargetsInput(
          initialExercise.advanced?.perSetTargets,
        ),
        weekOverrides: formatWeekOverridesInput(
          initialExercise.advanced?.weekOverrides,
        ),
      });
      setActiveTab(
        hasAdvancedExerciseEditorFields(initialExercise) ||
          initialSettings?.incrementKg != null ||
          (initialSettings?.weightMode != null &&
            initialSettings.weightMode !== 'total')
          ? 'advanced'
          : 'basic',
      );
    } else {
      setForm(blankState);
      setActiveTab('basic');
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
    const trimmedRest = form.restSeconds.trim();
    const parsedRest = trimmedRest.length > 0 ? Number(trimmedRest) : null;
    if (
      parsedRest != null &&
      (!Number.isFinite(parsedRest) ||
        parsedRest < 0 ||
        !Number.isInteger(parsedRest))
    ) {
      setError(t('addExercise.errors.restInvalid'));
      return;
    }
    const existingAdvanced =
      mode === 'edit' ? (initialExercise?.advanced ?? {}) : {};
    const nextAdvanced = {
      ...existingAdvanced,
      restSeconds: parsedRest ?? undefined,
      rir: parseRirInput(form.rirLabel),
      intensity: parseIntensityInput(form.intensityLabel),
      tempo: form.tempo.trim() || undefined,
      progressionRule: parseProgressionRuleInput(form.progressionRuleLabel),
      unilateral: parseUnilateralInput(form.unilateralLabel),
      equipment: form.equipment.trim() || undefined,
      primaryMuscles: parseLineList(form.primaryMuscles),
      secondaryMuscles: parseLineList(form.secondaryMuscles),
      technicalNotes: parseLineList(form.technicalNotes),
      executionCues: parseLineList(form.executionCues),
      perSetTargets: parsePerSetTargetsInput(form.perSetTargets),
      weekOverrides: parseWeekOverridesInput(form.weekOverrides),
    };
    if (nextAdvanced.restSeconds == null) {
      delete nextAdvanced.restSeconds;
    }
    if (!nextAdvanced.rir) {
      delete nextAdvanced.rir;
    }
    if (!nextAdvanced.intensity) {
      delete nextAdvanced.intensity;
    }
    if (!nextAdvanced.tempo) {
      delete nextAdvanced.tempo;
    }
    if (!nextAdvanced.progressionRule) {
      delete nextAdvanced.progressionRule;
    }
    if (!nextAdvanced.unilateral) {
      delete nextAdvanced.unilateral;
    }
    if (!nextAdvanced.equipment) {
      delete nextAdvanced.equipment;
    }
    if (!nextAdvanced.primaryMuscles) {
      delete nextAdvanced.primaryMuscles;
    }
    if (!nextAdvanced.secondaryMuscles) {
      delete nextAdvanced.secondaryMuscles;
    }
    if (!nextAdvanced.technicalNotes) {
      delete nextAdvanced.technicalNotes;
    }
    if (!nextAdvanced.executionCues) {
      delete nextAdvanced.executionCues;
    }
    if (!nextAdvanced.perSetTargets) {
      delete nextAdvanced.perSetTargets;
    }
    if (!nextAdvanced.weekOverrides) {
      delete nextAdvanced.weekOverrides;
    }
    const advanced =
      Object.keys(nextAdvanced).length > 0 ? nextAdvanced : undefined;
    const exerciseId =
      initialExercise?.id ?? createExerciseId(form.name.trim());
    const settings = buildUserExerciseSettings({
      exerciseId,
      workingWeight: form.workingWeight,
      incrementKg: form.incrementKg,
      current: initialSettings,
      weightMode: form.weightMode,
      weightUnit,
      updatedAt: new Date().toISOString(),
    });

    onSubmit({
      exercise: {
        id: exerciseId,
        name: form.name.trim(),
        canonicalExerciseId: form.canonicalExerciseId.trim() || undefined,
        muscleGroup: form.muscleGroup,
        aliases: parseLineList(form.aliases) ?? undefined,
        variantLabel: form.variantLabel.trim() || undefined,
        sessionSpecific: form.sessionSpecific,
        sets: parsedSets,
        reps: formatRepsLabel(
          form.reps.trim() || '8-10',
          nextAdvanced.unilateral,
        ),
        notes: form.notes.trim(),
        advanced,
      },
      settings,
    });
    onClose();
  };

  const tabBar = (
    <View style={styles.tabBar}>
      <Pressable
        style={[
          styles.tabButton,
          activeTab === 'basic' && styles.tabButtonActive,
        ]}
        onPress={() => setActiveTab('basic')}
        testID={E2E_IDS.exerciseModal.tabBasic}
      >
        <Text
          style={[
            styles.tabButtonText,
            activeTab === 'basic' && styles.tabButtonTextActive,
          ]}
        >
          {t('addExercise.tabs.basic')}
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.tabButton,
          activeTab === 'advanced' && styles.tabButtonActive,
        ]}
        onPress={() => setActiveTab('advanced')}
        testID={E2E_IDS.exerciseModal.tabAdvanced}
      >
        <Text
          style={[
            styles.tabButtonText,
            activeTab === 'advanced' && styles.tabButtonTextActive,
          ]}
        >
          {t('addExercise.tabs.advanced')}
        </Text>
      </Pressable>
    </View>
  );
  const restUsesDefault = form.restSeconds.trim().length === 0;

  const basicFields = (
    <>
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
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
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

      <Text style={styles.label}>{t('exerciseSettings.workingWeight')}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={form.workingWeight}
          onChangeText={(text) =>
            setForm((prev) => ({ ...prev, workingWeight: text }))
          }
          keyboardType="decimal-pad"
          style={styles.input}
        />
        <Text style={styles.unitText}>{formatWeightUnit(weightUnit)}</Text>
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
    </>
  );

  const advancedFields = (
    <View style={styles.advancedSection}>
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>{t('addExercise.advanced.rest')}</Text>
          <View style={styles.presetChipsWrap}>
            <Pressable
              onPress={() =>
                setForm((prev) => ({
                  ...prev,
                  restSeconds: '',
                }))
              }
              style={[styles.chip, restUsesDefault && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  restUsesDefault && styles.chipTextActive,
                ]}
              >
                {t('addExercise.advanced.restUseDefault')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                setForm((prev) => ({
                  ...prev,
                  restSeconds:
                    prev.restSeconds.trim().length > 0
                      ? prev.restSeconds
                      : '180',
                }))
              }
              style={[styles.chip, !restUsesDefault && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  !restUsesDefault && styles.chipTextActive,
                ]}
              >
                {t('addExercise.advanced.restCustom')}
              </Text>
            </Pressable>
          </View>
          {!restUsesDefault ? (
            <>
              <TextInput
                value={form.restSeconds}
                onChangeText={(text) =>
                  setForm((prev) => ({ ...prev, restSeconds: text }))
                }
                keyboardType="numeric"
                placeholder={t('addExercise.advanced.restPlaceholder')}
                placeholderTextColor={tokens.colors.textMuted}
                style={styles.input}
              />
              <View style={styles.presetChipsWrap}>
                {REST_PRESETS.map((preset) => {
                  const active = form.restSeconds === preset.value;
                  return (
                    <Pressable
                      key={preset.value}
                      onPress={() =>
                        setForm((prev) => ({
                          ...prev,
                          restSeconds: preset.value,
                        }))
                      }
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>{t('addExercise.advanced.rir')}</Text>
          <TextInput
            value={form.rirLabel}
            onChangeText={(text) =>
              setForm((prev) => ({ ...prev, rirLabel: text }))
            }
            placeholder={t('addExercise.advanced.rirPlaceholder')}
            placeholderTextColor={tokens.colors.textMuted}
            style={styles.input}
          />
          <View style={styles.presetChipsWrap}>
            {RIR_PRESETS.map((preset) => {
              const active = form.rirLabel.trim() === preset;
              return (
                <Pressable
                  key={preset}
                  onPress={() =>
                    setForm((prev) => ({ ...prev, rirLabel: preset }))
                  }
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {preset}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>
            {t('addExercise.advanced.intensity')}
          </Text>
          <TextInput
            value={form.intensityLabel}
            onChangeText={(text) =>
              setForm((prev) => ({ ...prev, intensityLabel: text }))
            }
            placeholder={t('addExercise.advanced.intensityPlaceholder')}
            placeholderTextColor={tokens.colors.textMuted}
            style={styles.input}
          />
          <View style={styles.presetChipsWrap}>
            {INTENSITY_PRESETS.map((preset) => {
              const active =
                form.intensityLabel.trim().toLowerCase() ===
                preset.toLowerCase();
              return (
                <Pressable
                  key={preset}
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      intensityLabel: preset,
                    }))
                  }
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {preset}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>{t('addExercise.advanced.tempo')}</Text>
          <TextInput
            value={form.tempo}
            onChangeText={(text) =>
              setForm((prev) => ({ ...prev, tempo: text }))
            }
            placeholder={t('addExercise.advanced.tempoPlaceholder')}
            placeholderTextColor={tokens.colors.textMuted}
            style={styles.input}
          />
        </View>
      </View>

      <Text style={styles.label}>
        {t('addExercise.advanced.progressionRule')}
      </Text>
      <TextInput
        value={form.progressionRuleLabel}
        onChangeText={(text) =>
          setForm((prev) => ({ ...prev, progressionRuleLabel: text }))
        }
        placeholder={t('addExercise.advanced.progressionRulePlaceholder')}
        placeholderTextColor={tokens.colors.textMuted}
        style={[styles.input, styles.textareaCompact]}
        multiline
      />

      <Text style={styles.label}>{t('exerciseSettings.weightMode')}</Text>
      <View style={styles.chipsWrap}>
        {EXERCISE_WEIGHT_MODES.map((mode) => {
          const active = form.weightMode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => setForm((prev) => ({ ...prev, weightMode: mode }))}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {getWeightModeLabel(mode)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>{t('exerciseSettings.increment')}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={form.incrementKg}
          onChangeText={(text) =>
            setForm((prev) => ({ ...prev, incrementKg: text }))
          }
          keyboardType="decimal-pad"
          style={styles.input}
        />
        <Text style={styles.unitText}>kg</Text>
      </View>

      <Text style={styles.label}>{t('addExercise.advanced.unilateral')}</Text>
      <TextInput
        value={form.unilateralLabel}
        onChangeText={(text) =>
          setForm((prev) => ({ ...prev, unilateralLabel: text }))
        }
        placeholder={t('addExercise.advanced.unilateralPlaceholder')}
        placeholderTextColor={tokens.colors.textMuted}
        style={styles.input}
      />

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>
            {t('addExercise.advanced.equipment')}
          </Text>
          <TextInput
            value={form.equipment}
            onChangeText={(text) =>
              setForm((prev) => ({ ...prev, equipment: text }))
            }
            placeholder={t('addExercise.advanced.equipmentPlaceholder')}
            placeholderTextColor={tokens.colors.textMuted}
            style={styles.input}
          />
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>
            {t('addExercise.advanced.primaryMuscles')}
          </Text>
          <TextInput
            value={form.primaryMuscles}
            onChangeText={(text) =>
              setForm((prev) => ({ ...prev, primaryMuscles: text }))
            }
            placeholder={t('addExercise.advanced.primaryMusclesPlaceholder')}
            placeholderTextColor={tokens.colors.textMuted}
            style={[styles.input, styles.textareaCompact]}
            multiline
          />
        </View>
      </View>

      <Text style={styles.label}>
        {t('addExercise.advanced.secondaryMuscles')}
      </Text>
      <TextInput
        value={form.secondaryMuscles}
        onChangeText={(text) =>
          setForm((prev) => ({ ...prev, secondaryMuscles: text }))
        }
        placeholder={t('addExercise.advanced.secondaryMusclesPlaceholder')}
        placeholderTextColor={tokens.colors.textMuted}
        style={[styles.input, styles.textareaCompact]}
        multiline
      />

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>
            {t('addExercise.advanced.canonicalExerciseId')}
          </Text>
          <TextInput
            value={form.canonicalExerciseId}
            onChangeText={(text) =>
              setForm((prev) => ({ ...prev, canonicalExerciseId: text }))
            }
            placeholder={t(
              'addExercise.advanced.canonicalExerciseIdPlaceholder',
            )}
            placeholderTextColor={tokens.colors.textMuted}
            style={styles.input}
          />
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>
            {t('addExercise.advanced.variantLabel')}
          </Text>
          <TextInput
            value={form.variantLabel}
            onChangeText={(text) =>
              setForm((prev) => ({ ...prev, variantLabel: text }))
            }
            placeholder={t('addExercise.advanced.variantLabelPlaceholder')}
            placeholderTextColor={tokens.colors.textMuted}
            style={styles.input}
          />
        </View>
      </View>

      <Text style={styles.label}>{t('addExercise.advanced.aliases')}</Text>
      <TextInput
        value={form.aliases}
        onChangeText={(text) => setForm((prev) => ({ ...prev, aliases: text }))}
        placeholder={t('addExercise.advanced.aliasesPlaceholder')}
        placeholderTextColor={tokens.colors.textMuted}
        style={[styles.input, styles.textareaCompact]}
        multiline
      />

      <Text style={styles.label}>
        {t('addExercise.advanced.sessionSpecific')}
      </Text>
      <Pressable
        style={[styles.chip, form.sessionSpecific && styles.chipActive]}
        onPress={() =>
          setForm((prev) => ({
            ...prev,
            sessionSpecific: !prev.sessionSpecific,
          }))
        }
      >
        <Text
          style={[
            styles.chipText,
            form.sessionSpecific && styles.chipTextActive,
          ]}
        >
          {t('addExercise.advanced.sessionSpecificToggle')}
        </Text>
      </Pressable>

      <Text style={styles.label}>
        {t('addExercise.advanced.technicalNotes')}
      </Text>
      <TextInput
        value={form.technicalNotes}
        onChangeText={(text) =>
          setForm((prev) => ({ ...prev, technicalNotes: text }))
        }
        placeholder={t('addExercise.advanced.technicalNotesPlaceholder')}
        placeholderTextColor={tokens.colors.textMuted}
        style={[styles.input, styles.textareaCompact]}
        multiline
      />

      <Text style={styles.label}>
        {t('addExercise.advanced.executionCues')}
      </Text>
      <TextInput
        value={form.executionCues}
        onChangeText={(text) =>
          setForm((prev) => ({ ...prev, executionCues: text }))
        }
        placeholder={t('addExercise.advanced.executionCuesPlaceholder')}
        placeholderTextColor={tokens.colors.textMuted}
        style={[styles.input, styles.textareaCompact]}
        multiline
      />

      <Text style={styles.label}>
        {t('addExercise.advanced.perSetTargets')}
      </Text>
      <TextInput
        value={form.perSetTargets}
        onChangeText={(text) =>
          setForm((prev) => ({ ...prev, perSetTargets: text }))
        }
        placeholder={t('addExercise.advanced.perSetTargetsPlaceholder')}
        placeholderTextColor={tokens.colors.textMuted}
        style={[styles.input, styles.textareaCompact]}
        multiline
      />

      <Text style={styles.label}>
        {t('addExercise.advanced.weekOverrides')}
      </Text>
      <TextInput
        value={form.weekOverrides}
        onChangeText={(text) =>
          setForm((prev) => ({ ...prev, weekOverrides: text }))
        }
        placeholder={t('addExercise.advanced.weekOverridesPlaceholder')}
        placeholderTextColor={tokens.colors.textMuted}
        style={[styles.input, styles.textareaCompact]}
        multiline
      />
    </View>
  );

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
            {tabBar}
            {activeTab === 'basic' ? basicFields : advancedFields}

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
        {tabBar}
        {activeTab === 'basic' ? basicFields : advancedFields}

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
    tabBar: {
      flexDirection: 'row',
      gap: tokens.spacing.xs,
      marginBottom: tokens.spacing.xs,
    },
    tabButton: {
      flex: 1,
      borderRadius: tokens.radius.pill,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      alignItems: 'center',
    },
    tabButtonActive: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    tabButtonText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    tabButtonTextActive: {
      color: tokens.colors.onPrimary,
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
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    unitText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
    },
    textarea: {
      minHeight: 84,
      textAlignVertical: 'top',
    },
    textareaCompact: {
      minHeight: 68,
      textAlignVertical: 'top',
    },
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing.xs,
    },
    presetChipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing.xs,
      marginTop: 2,
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
    advancedSection: {
      gap: tokens.spacing.sm,
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
