import {
  Activity,
  ChevronLeft,
  Clock,
  Dumbbell,
  Flame,
  Heart,
  Minus,
  Navigation,
  Plus,
  RefreshCw,
  Repeat,
  Star,
  Trash2,
} from 'lucide-react-native';
import type React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import type { SortableGridRenderItem } from 'react-native-sortables';
import Sortable from 'react-native-sortables';
import { AnimatedPressable } from '@/animation/primitives';
import { AnimatedModalShell } from '@/components/AnimatedModalShell';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { E2E_IDS } from '@/config/testIds';
import { dayIconMap, dayIconOptions, muscleGroups } from '@/data/workouts';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import type {
  DayConfig,
  MuscleFrequencyTarget,
  TrainingProgram,
  WeekConfig,
  WorkoutSchedule,
  WorkoutSession,
} from '@/types';
import { normalizeFrequencySummaryEntries } from '@/utils/program';
import { Text, TextInput } from '../AppText';

interface ProgramSettingsModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  program?: TrainingProgram | null;
  weekConfigs: WeekConfig[];
  dayConfigs: DayConfig[];
  workouts: WorkoutSession[];
  onClose: () => void;
  onProgramChange: (
    value: Partial<
      Pick<
        TrainingProgram,
        | 'name'
        | 'subtitle'
        | 'goal'
        | 'description'
        | 'source'
        | 'startDate'
        | 'durationWeeks'
        | 'progressionModel'
        | 'frequencySummary'
        | 'defaultRestSeconds'
      >
    >,
  ) => void;
  onWeekConfigsChange: (value: WeekConfig[]) => void;
  onDayConfigsChange: (value: DayConfig[]) => void;
  onWorkoutDefaultRestChange: (
    workoutId: string,
    defaultRestSeconds?: number,
  ) => void;
  onPrompt: (
    title: string,
    message: string,
    actions: Array<{
      label: string;
      tone?: 'cancel' | 'destructive';
      onPress: () => void;
    }>,
  ) => void;
}

type WeekDraft = WeekConfig & { uiKey: string };
type FrequencyTargetDraft = MuscleFrequencyTarget & { uiKey: string };

const MAX_DAYS = 7;
const MAX_FREQUENCY_TARGETS = 8;
const WEEKDAY_VALUES = [1, 2, 3, 4, 5, 6, 7] as const;
const WEEKDAY_KEY_SUFFIXES = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

const dayIconComponents: Record<
  string,
  React.ComponentType<{ size: number; color: string }>
> = {
  Activity,
  Clock,
  Dumbbell,
  Flame,
  Heart,
  Navigation,
  RefreshCw,
  Repeat,
  Star,
};
const progressionModelOptions = [
  'simple_load_modifier',
  'exercise_rules',
  'mixed',
  'manual',
] as const;
const sourceTypeOptions = [
  'manual',
  'coach',
  'template',
  'imported_pdf',
  'imported_json',
] as const;

export function ProgramSettingsModal({
  open,
  tokens,
  topInset,
  bottomInset,
  program,
  weekConfigs,
  dayConfigs,
  workouts,
  onClose,
  onProgramChange,
  onWeekConfigsChange,
  onDayConfigsChange,
  onWorkoutDefaultRestChange,
  onPrompt,
}: ProgramSettingsModalProps) {
  const layout = useResponsiveLayout();
  const [activeTab, setActiveTab] = useState<'program' | 'weeks' | 'days'>(
    'program',
  );
  const [draftWeeks, setDraftWeeks] = useState<WeekDraft[]>([]);
  const [draftDays, setDraftDays] = useState<DayConfig[]>([]);
  const [draftWorkoutRestById, setDraftWorkoutRestById] = useState<
    Record<string, string>
  >({});
  const [draftFrequencySummary, setDraftFrequencySummary] = useState<
    FrequencyTargetDraft[]
  >([]);
  const [draftProgram, setDraftProgram] = useState({
    name: '',
    subtitle: '',
    goal: '',
    description: '',
    sourceType: 'manual' as NonNullable<TrainingProgram['source']>['type'],
    sourceLabel: '',
    sourceImportedAt: '',
    startDate: '',
    durationWeeks: '',
    defaultRestSeconds: '',
    progressionModel: 'simple_load_modifier' as NonNullable<
      TrainingProgram['progressionModel']
    >,
  });
  const [editingLoadWeekKey, setEditingLoadWeekKey] = useState<string | null>(
    null,
  );
  const [editingLoadText, setEditingLoadText] = useState('');
  const weekUiKeyCounterRef = useRef(0);
  const frequencyUiKeyCounterRef = useRef(0);
  const dayIdCounterRef = useRef(0);
  const wasOpenRef = useRef(false);

  const { t } = useTranslation();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset, layout),
    [tokens, topInset, bottomInset, layout],
  );
  const getShortWeekdayLabel = useCallback(
    (weekday: number) =>
      t(
        `programSettings.day.weekdays.short.${
          WEEKDAY_KEY_SUFFIXES[weekday - 1] ?? 'mon'
        }`,
      ),
    [t],
  );
  const getNarrowWeekdayLabel = useCallback(
    (weekday: number) =>
      t(
        `programSettings.day.weekdays.narrow.${
          WEEKDAY_KEY_SUFFIXES[weekday - 1] ?? 'mon'
        }`,
      ),
    [t],
  );

  const createWeekUiKey = useCallback(() => {
    const next = weekUiKeyCounterRef.current;
    weekUiKeyCounterRef.current += 1;
    return `week-ui-${next}`;
  }, []);

  const createFrequencyUiKey = useCallback(() => {
    const next = frequencyUiKeyCounterRef.current;
    frequencyUiKeyCounterRef.current += 1;
    return `frequency-ui-${next}`;
  }, []);

  const toWeekConfigs = useCallback(
    (weeks: WeekDraft[]): WeekConfig[] =>
      weeks.map((w, i) => ({
        id: i + 1,
        name: w.name,
        loadModifier: w.loadModifier,
        volumeModifier: w.volumeModifier,
        rir: w.rir,
        notes: w.notes,
      })),
    [],
  );

  if (open !== wasOpenRef.current) {
    wasOpenRef.current = open;
    setEditingLoadWeekKey(null);
    setEditingLoadText('');
    if (open) {
      weekUiKeyCounterRef.current = 0;
      frequencyUiKeyCounterRef.current = 0;
      dayIdCounterRef.current = 0;
      setDraftWeeks(
        weekConfigs.map((w, i) => ({
          ...w,
          id: i + 1,
          uiKey: createWeekUiKey(),
        })),
      );
      setDraftDays(dayConfigs);
      setDraftWorkoutRestById(
        Object.fromEntries(
          workouts.map((workout) => [
            workout.id,
            workout.defaultRestSeconds != null
              ? String(workout.defaultRestSeconds)
              : '',
          ]),
        ),
      );
      setDraftFrequencySummary(
        (program?.frequencySummary ?? []).map((item) => ({
          ...item,
          uiKey: createFrequencyUiKey(),
        })),
      );
      setDraftProgram({
        name: program?.name ?? '',
        subtitle: program?.subtitle ?? '',
        goal: program?.goal ?? '',
        description: program?.description ?? '',
        sourceType: program?.source?.type ?? 'manual',
        sourceLabel: program?.source?.label ?? '',
        sourceImportedAt: program?.source?.importedAt ?? '',
        startDate: program?.startDate ?? '',
        durationWeeks:
          program?.durationWeeks != null ? String(program.durationWeeks) : '',
        defaultRestSeconds:
          program?.defaultRestSeconds != null
            ? String(program.defaultRestSeconds)
            : '',
        progressionModel: program?.progressionModel ?? 'simple_load_modifier',
      });
    }
  }

  const handleWorkoutRestChange = useCallback(
    (workoutId: string, value: string) => {
      const sanitized = value.replace(/[^0-9]/g, '');
      setDraftWorkoutRestById((prev) => ({
        ...prev,
        [workoutId]: sanitized,
      }));
      onWorkoutDefaultRestChange(
        workoutId,
        sanitized.trim().length > 0 ? Number(sanitized) : undefined,
      );
    },
    [onWorkoutDefaultRestChange],
  );

  const commitFrequencySummary = useCallback(
    (
      next: Array<Pick<FrequencyTargetDraft, 'muscleGroup' | 'targetPerWeek'>>,
    ) => {
      onProgramChange({
        frequencySummary: normalizeFrequencySummaryEntries(next),
      });
    },
    [onProgramChange],
  );

  const updateWeek = useCallback(
    (uiKey: string, update: Partial<WeekConfig>) => {
      setDraftWeeks((prev) => {
        const next = prev.map((w) =>
          w.uiKey === uiKey ? { ...w, ...update } : w,
        );
        onWeekConfigsChange(toWeekConfigs(next));
        return next;
      });
    },
    [onWeekConfigsChange, toWeekConfigs],
  );

  const addWeek = useCallback(() => {
    setDraftWeeks((prev) => {
      const nextId = prev.length + 1;
      const next: WeekDraft[] = [
        ...prev,
        {
          id: nextId,
          name: `Week ${nextId}`,
          loadModifier: 1,
          volumeModifier: 1,
          rir: 2,
          uiKey: createWeekUiKey(),
        },
      ];
      onWeekConfigsChange(toWeekConfigs(next));
      return next;
    });
  }, [createWeekUiKey, onWeekConfigsChange, toWeekConfigs]);

  const removeWeek = useCallback(
    (uiKey: string) => {
      const week = draftWeeks.find((w) => w.uiKey === uiKey);
      if (!week) return;
      onPrompt(
        t('programSettings.week.deleteTitle'),
        t('programSettings.week.deleteMessage', { name: week.name }),
        [
          { label: t('common.cancel'), tone: 'cancel', onPress: () => {} },
          {
            label: t('common.delete'),
            tone: 'destructive',
            onPress: () => {
              setDraftWeeks((prev) => {
                const next = prev
                  .filter((w) => w.uiKey !== uiKey)
                  .map((w, i) => ({ ...w, id: i + 1 }));
                onWeekConfigsChange(toWeekConfigs(next));
                return next;
              });
            },
          },
        ],
      );
    },
    [draftWeeks, onWeekConfigsChange, toWeekConfigs, onPrompt, t],
  );

  const updateDay = useCallback(
    (id: string, update: Partial<DayConfig>) => {
      setDraftDays((prev) => {
        const next = prev.map((d) => (d.id === id ? { ...d, ...update } : d));
        onDayConfigsChange(next);
        return next;
      });
    },
    [onDayConfigsChange],
  );

  const updateDaySchedule = useCallback(
    (id: string, schedule: WorkoutSchedule | undefined) => {
      updateDay(id, { schedule });
    },
    [updateDay],
  );

  const addDay = useCallback(() => {
    setDraftDays((prev) => {
      if (prev.length >= MAX_DAYS) return prev;
      const id = `day-${Date.now().toString(36)}-${dayIdCounterRef.current}`;
      dayIdCounterRef.current += 1;
      const next: DayConfig[] = [
        ...prev,
        { id, name: `Day ${prev.length + 1}`, icon: dayIconOptions[0] },
      ];
      onDayConfigsChange(next);
      return next;
    });
  }, [onDayConfigsChange]);

  const removeDay = useCallback(
    (index: number) => {
      const day = draftDays[index];
      if (!day) return;
      onPrompt(
        t('programSettings.day.deleteTitle'),
        t('programSettings.day.deleteMessage', { name: day.name }),
        [
          { label: t('common.cancel'), tone: 'cancel', onPress: () => {} },
          {
            label: t('common.delete'),
            tone: 'destructive',
            onPress: () => {
              setDraftDays((prev) => {
                if (prev.length <= 1) return prev;
                const next = prev.filter((_, i) => i !== index);
                onDayConfigsChange(next);
                return next;
              });
            },
          },
        ],
      );
    },
    [draftDays, onDayConfigsChange, onPrompt, t],
  );

  const weekScrollRef = useAnimatedRef<Animated.ScrollView>();
  const dayScrollRef = useAnimatedRef<Animated.ScrollView>();

  const renderWeekItem = useCallback(
    ({ item: week, index: _index }: { item: WeekDraft; index: number }) => {
      const loadPct = Math.round((week.loadModifier - 1) * 100);
      const loadLabel =
        loadPct === 0
          ? t('programSettings.week.baseline')
          : `${loadPct > 0 ? '+' : ''}${loadPct}%`;
      const volumePct = Math.round(((week.volumeModifier ?? 1) - 1) * 100);
      const volumeLabel =
        volumePct === 0
          ? t('programSettings.week.baseline')
          : `${volumePct > 0 ? '+' : ''}${volumePct}%`;

      return (
        <View
          style={styles.card}
          testID={E2E_IDS.programSettings.weekCard(week.id)}
        >
          <View style={styles.cardPressable}>
            <View style={styles.cardHeader}>
              <TextInput
                value={week.name}
                onChangeText={(text) => updateWeek(week.uiKey, { name: text })}
                style={styles.weekNameHeaderInput}
                placeholder={t('programSettings.week.namePlaceholder')}
                placeholderTextColor={tokens.colors.textMuted}
                multiline={false}
                returnKeyType="done"
                testID={E2E_IDS.programSettings.weekName(week.id)}
              />

              <AnimatedPressable
                style={[styles.rowButton, styles.rowButtonDelete]}
                hitSlop={8}
                onPress={() => removeWeek(week.uiKey)}
                pointerEvents="box-only"
                testID={E2E_IDS.programSettings.weekDelete(week.id)}
              >
                <Trash2 size={16} color={tokens.colors.accentDanger} />
              </AnimatedPressable>
            </View>

            <Text style={styles.sectionLabel}>
              {t('programSettings.week.loadModifier')}
            </Text>
            <View style={styles.loadControlRow}>
              <AnimatedPressable
                style={styles.stepButton}
                onPress={() => {
                  const nextPct = Math.max(-50, Math.min(50, loadPct - 5));
                  updateWeek(week.uiKey, { loadModifier: 1 + nextPct / 100 });
                }}
                testID={E2E_IDS.programSettings.weekLoadDecrement(week.id)}
              >
                <Minus size={18} color={tokens.colors.textSecondary} />
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.loadValueWrap}
                pressScale={0.99}
                onPress={() => {
                  setEditingLoadWeekKey(week.uiKey);
                  setEditingLoadText(String(loadPct));
                }}
                testID={E2E_IDS.programSettings.weekLoadValue(week.id)}
              >
                {editingLoadWeekKey === week.uiKey ? (
                  <View style={styles.loadValueRow}>
                    <TextInput
                      value={editingLoadText}
                      onChangeText={setEditingLoadText}
                      style={styles.loadValueInput}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={withAlpha(
                        tokens.colors.textSecondary,
                        0.72,
                      )}
                      onBlur={() => {
                        const next = Number(editingLoadText);
                        const nextPct = Number.isFinite(next)
                          ? Math.max(-50, Math.min(50, Math.round(next)))
                          : 0;
                        updateWeek(week.uiKey, {
                          loadModifier: 1 + nextPct / 100,
                        });
                        setEditingLoadWeekKey(null);
                        setEditingLoadText('');
                      }}
                      onSubmitEditing={() => {
                        const next = Number(editingLoadText);
                        const nextPct = Number.isFinite(next)
                          ? Math.max(-50, Math.min(50, Math.round(next)))
                          : 0;
                        updateWeek(week.uiKey, {
                          loadModifier: 1 + nextPct / 100,
                        });
                        setEditingLoadWeekKey(null);
                        setEditingLoadText('');
                      }}
                      returnKeyType="done"
                    />
                    <Text style={styles.loadValueUnit}>%</Text>
                  </View>
                ) : (
                  <Text style={styles.loadValue}>{loadLabel}</Text>
                )}
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.stepButton}
                onPress={() => {
                  const nextPct = Math.max(-50, Math.min(50, loadPct + 5));
                  updateWeek(week.uiKey, { loadModifier: 1 + nextPct / 100 });
                }}
                testID={E2E_IDS.programSettings.weekLoadIncrement(week.id)}
              >
                <Plus size={18} color={tokens.colors.textSecondary} />
              </AnimatedPressable>
            </View>

            <Text style={styles.sectionLabel}>
              {t('programSettings.week.rir')}
            </Text>
            <View style={styles.rirRow}>
              {[1, 2, 3, 4].map((value) => {
                const active = week.rir === value;
                return (
                  <AnimatedPressable
                    key={value}
                    style={[styles.rirButton, active && styles.rirButtonActive]}
                    onPress={() => updateWeek(week.uiKey, { rir: value })}
                    testID={E2E_IDS.programSettings.weekRir(week.id, value)}
                  >
                    <Text
                      style={[styles.rirText, active && styles.rirTextActive]}
                    >
                      {value}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>
              {t('programSettings.week.volumeModifier')}
            </Text>
            <View style={styles.loadControlRow}>
              <AnimatedPressable
                style={styles.stepButton}
                onPress={() => {
                  const nextPct = Math.max(-50, Math.min(50, volumePct - 5));
                  updateWeek(week.uiKey, {
                    volumeModifier: 1 + nextPct / 100,
                  });
                }}
              >
                <Minus size={18} color={tokens.colors.textSecondary} />
              </AnimatedPressable>
              <View style={styles.loadValueWrap}>
                <Text style={styles.loadValue}>{volumeLabel}</Text>
              </View>
              <AnimatedPressable
                style={styles.stepButton}
                onPress={() => {
                  const nextPct = Math.max(-50, Math.min(50, volumePct + 5));
                  updateWeek(week.uiKey, {
                    volumeModifier: 1 + nextPct / 100,
                  });
                }}
              >
                <Plus size={18} color={tokens.colors.textSecondary} />
              </AnimatedPressable>
            </View>

            <Text style={styles.sectionLabel}>
              {t('programSettings.week.notes')}
            </Text>
            <TextInput
              value={week.notes ?? ''}
              onChangeText={(text) =>
                updateWeek(week.uiKey, { notes: text.trim() || undefined })
              }
              style={[styles.input, styles.textareaCompact]}
              placeholder={t('programSettings.week.notesPlaceholder')}
              placeholderTextColor={tokens.colors.textMuted}
              multiline
            />
          </View>
        </View>
      );
    },
    [
      removeWeek,
      styles,
      t,
      tokens.colors.accentDanger,
      tokens.colors.textSecondary,
      tokens.colors.textMuted,
      updateWeek,
      editingLoadText,
      editingLoadWeekKey,
    ],
  );

  const renderDayItem = useCallback(
    ({ item: day, index }: { item: DayConfig; index: number }) => {
      const visibleIcons = dayIconOptions.slice(0, 9);
      const slots: Array<string | '__custom__'> = [
        ...visibleIcons,
        '__custom__',
      ];
      const scheduleType = day.schedule?.type ?? 'unscheduled';
      const selectedWeekdays =
        scheduleType === 'fixed_day'
          ? day.schedule?.preferredDay != null
            ? [day.schedule.preferredDay]
            : []
          : (day.schedule?.daysOfWeek ?? []);
      const workoutRestValue = draftWorkoutRestById[day.id] ?? '';

      const renderSlot = (slot: string | '__custom__') => {
        if (slot === '__custom__') {
          return (
            <AnimatedPressable
              key="__custom__"
              style={[styles.iconOption, styles.iconOptionMore]}
              hitSlop={4}
              onPress={() => {
                // placeholder for a future custom icon selector
              }}
            >
              <Plus size={18} color={tokens.colors.accentPrimary} />
              <Text style={[styles.iconLabel, styles.iconLabelCustom]}>
                {t('programSettings.day.iconMore')}
              </Text>
            </AnimatedPressable>
          );
        }

        const option = slot;
        const active = day.icon === option;
        const label =
          option === 'RefreshCw'
            ? t('programSettings.day.iconRefresh')
            : option;
        const IconComponent = dayIconComponents[dayIconMap[option]];
        return (
          <AnimatedPressable
            key={option}
            style={[styles.iconOption, active && styles.iconOptionActive]}
            hitSlop={4}
            onPress={() => updateDay(day.id, { icon: option })}
            testID={E2E_IDS.programSettings.dayIcon(day.id, option)}
          >
            {IconComponent && (
              <IconComponent
                size={18}
                color={
                  active
                    ? tokens.colors.accentPrimary
                    : tokens.colors.textSecondary
                }
              />
            )}
            <Text style={[styles.iconLabel, active && styles.iconLabelActive]}>
              {label}
            </Text>
          </AnimatedPressable>
        );
      };

      const setScheduleType = (
        nextType: 'unscheduled' | 'fixed_day' | 'day_window',
      ) => {
        if (nextType === 'unscheduled') {
          updateDaySchedule(day.id, undefined);
          return;
        }

        if (nextType === 'fixed_day') {
          const preferredDay =
            day.schedule?.preferredDay ?? day.schedule?.daysOfWeek?.[0] ?? 1;
          updateDaySchedule(day.id, {
            type: 'fixed_day',
            preferredDay,
            label: getShortWeekdayLabel(preferredDay),
          });
          return;
        }

        const daysOfWeek =
          day.schedule?.daysOfWeek && day.schedule.daysOfWeek.length > 0
            ? day.schedule.daysOfWeek
            : day.schedule?.preferredDay != null
              ? [day.schedule.preferredDay]
              : [1];
        updateDaySchedule(day.id, {
          type: 'day_window',
          daysOfWeek,
          preferredDay: daysOfWeek[0],
          label: daysOfWeek
            .map((weekday) => getShortWeekdayLabel(weekday))
            .join('/'),
        });
      };

      const toggleWeekday = (weekday: number) => {
        if (scheduleType === 'fixed_day') {
          updateDaySchedule(day.id, {
            type: 'fixed_day',
            preferredDay: weekday,
            label: getShortWeekdayLabel(weekday),
          });
          return;
        }

        if (scheduleType !== 'day_window') {
          return;
        }

        const currentDays = day.schedule?.daysOfWeek ?? [];
        const nextDays = currentDays.includes(weekday)
          ? currentDays.filter((value) => value !== weekday)
          : [...currentDays, weekday].sort((a, b) => a - b);
        if (nextDays.length === 0) {
          updateDaySchedule(day.id, undefined);
          return;
        }
        updateDaySchedule(day.id, {
          type: 'day_window',
          daysOfWeek: nextDays,
          preferredDay: nextDays.includes(day.schedule?.preferredDay ?? -1)
            ? day.schedule?.preferredDay
            : nextDays[0],
          label: nextDays.map((value) => getShortWeekdayLabel(value)).join('/'),
        });
      };

      return (
        <View
          style={styles.card}
          testID={E2E_IDS.programSettings.dayCard(day.id)}
        >
          <View style={styles.cardPressable}>
            <View style={styles.cardHeader}>
              <TextInput
                value={day.name}
                onChangeText={(text) => updateDay(day.id, { name: text })}
                style={styles.weekNameHeaderInput}
                placeholder={t('programSettings.day.namePlaceholder', {
                  number: index + 1,
                })}
                placeholderTextColor={tokens.colors.textMuted}
                multiline={false}
                returnKeyType="done"
                testID={E2E_IDS.programSettings.dayName(day.id)}
              />
              <TextInput
                value={day.sessionLabel ?? ''}
                onChangeText={(text) =>
                  updateDay(day.id, {
                    sessionLabel: text.trim() || undefined,
                  })
                }
                style={styles.sessionLabelInput}
                placeholder={t('programSettings.day.sessionLabelPlaceholder')}
                placeholderTextColor={tokens.colors.textMuted}
                multiline={false}
                returnKeyType="done"
              />
              <AnimatedPressable
                style={[
                  styles.rowButton,
                  styles.rowButtonDelete,
                  draftDays.length <= 1 && styles.rowButtonDisabled,
                ]}
                hitSlop={8}
                disabled={draftDays.length <= 1}
                onPress={() => removeDay(index)}
                pointerEvents="box-only"
                testID={E2E_IDS.programSettings.dayDelete(day.id)}
              >
                <Trash2 size={16} color={tokens.colors.accentDanger} />
              </AnimatedPressable>
            </View>

            <Text style={styles.sectionLabel}>
              {t('programSettings.day.icon')}
            </Text>
            <View style={styles.iconGrid}>
              {slots.map((slot) => renderSlot(slot))}
            </View>

            <Text style={styles.sectionLabel}>
              {t('programSettings.day.schedule')}
            </Text>
            <View style={styles.scheduleTypeRow}>
              {(['unscheduled', 'fixed_day', 'day_window'] as const).map(
                (value) => {
                  const active = scheduleType === value;
                  return (
                    <AnimatedPressable
                      key={value}
                      style={[
                        styles.scheduleTypeButton,
                        active && styles.scheduleTypeButtonActive,
                      ]}
                      onPress={() => setScheduleType(value)}
                      testID={E2E_IDS.programSettings.dayScheduleType(
                        day.id,
                        value,
                      )}
                    >
                      <Text
                        style={[
                          styles.scheduleTypeText,
                          active && styles.scheduleTypeTextActive,
                        ]}
                      >
                        {t(`programSettings.day.scheduleTypes.${value}`)}
                      </Text>
                    </AnimatedPressable>
                  );
                },
              )}
            </View>

            {scheduleType !== 'unscheduled' ? (
              <>
                <Text style={styles.sectionLabel}>
                  {scheduleType === 'fixed_day'
                    ? t('programSettings.day.pickDay')
                    : t('programSettings.day.pickWindow')}
                </Text>
                <View style={styles.weekdayRow}>
                  {WEEKDAY_VALUES.map((weekday) => {
                    const active = selectedWeekdays.includes(weekday);
                    return (
                      <AnimatedPressable
                        key={weekday}
                        style={[
                          styles.weekdayButton,
                          active && styles.weekdayButtonActive,
                        ]}
                        onPress={() => toggleWeekday(weekday)}
                        testID={E2E_IDS.programSettings.dayScheduleWeekday(
                          day.id,
                          weekday,
                        )}
                      >
                        <Text
                          style={[
                            styles.weekdayText,
                            active && styles.weekdayTextActive,
                          ]}
                        >
                          {getNarrowWeekdayLabel(weekday)}
                        </Text>
                      </AnimatedPressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Text style={styles.sectionLabel}>
              {t('programSettings.program.defaultRest')}
            </Text>
            <TextInput
              value={workoutRestValue}
              onChangeText={(text) => handleWorkoutRestChange(day.id, text)}
              placeholder={t('programSettings.program.defaultRestPlaceholder')}
              placeholderTextColor={tokens.colors.textMuted}
              style={styles.input}
              keyboardType="number-pad"
              testID={E2E_IDS.programSettings.dayDefaultRest(day.id)}
            />
          </View>
        </View>
      );
    },
    [
      draftWorkoutRestById,
      draftDays.length,
      removeDay,
      styles,
      t,
      getNarrowWeekdayLabel,
      getShortWeekdayLabel,
      handleWorkoutRestChange,
      tokens.colors.accentDanger,
      tokens.colors.accentPrimary,
      tokens.colors.textMuted,
      tokens.colors.textSecondary,
      updateDaySchedule,
      updateDay,
    ],
  );

  const renderWeekSortableItem = useCallback<SortableGridRenderItem<WeekDraft>>(
    ({ item, index }) => renderWeekItem({ item, index }),
    [renderWeekItem],
  );

  const renderDaySortableItem = useCallback<SortableGridRenderItem<DayConfig>>(
    ({ item, index }) => renderDayItem({ item, index }),
    [renderDayItem],
  );

  const handleProgramFieldChange = useCallback(
    (
      key:
        | 'name'
        | 'subtitle'
        | 'goal'
        | 'description'
        | 'sourceLabel'
        | 'startDate',
      value: string,
    ) => {
      setDraftProgram((prev) => {
        const next = { ...prev, [key]: value };
        onProgramChange({
          name: next.name.trim() || 'Main Program',
          subtitle: next.subtitle.trim() || undefined,
          goal: next.goal.trim() || undefined,
          description: next.description.trim() || undefined,
          source: {
            type: next.sourceType,
            ...(next.sourceLabel.trim().length > 0
              ? { label: next.sourceLabel.trim() }
              : {}),
            ...(next.sourceImportedAt.trim().length > 0
              ? { importedAt: next.sourceImportedAt }
              : {}),
          },
          startDate: next.startDate.trim() || undefined,
        });
        return next;
      });
    },
    [onProgramChange],
  );

  const handleProgramRestChange = useCallback(
    (value: string) => {
      const sanitized = value.replace(/[^0-9]/g, '');
      setDraftProgram((prev) => ({
        ...prev,
        defaultRestSeconds: sanitized,
      }));
      onProgramChange({
        defaultRestSeconds:
          sanitized.trim().length > 0 ? Number(sanitized) : undefined,
      });
    },
    [onProgramChange],
  );

  const handleProgressionModelChange = useCallback(
    (value: NonNullable<TrainingProgram['progressionModel']>) => {
      setDraftProgram((prev) => ({
        ...prev,
        progressionModel: value,
      }));
      onProgramChange({ progressionModel: value });
    },
    [onProgramChange],
  );

  const handleSourceTypeChange = useCallback(
    (value: NonNullable<TrainingProgram['source']>['type']) => {
      setDraftProgram((prev) => ({
        ...prev,
        sourceType: value,
      }));
      onProgramChange({
        source: {
          type: value,
          ...(draftProgram.sourceLabel.trim().length > 0
            ? { label: draftProgram.sourceLabel.trim() }
            : {}),
          ...(draftProgram.sourceImportedAt.trim().length > 0
            ? { importedAt: draftProgram.sourceImportedAt }
            : {}),
        },
      });
    },
    [draftProgram.sourceImportedAt, draftProgram.sourceLabel, onProgramChange],
  );

  const handleDurationWeeksChange = useCallback(
    (value: string) => {
      const sanitized = value.replace(/[^0-9]/g, '');
      setDraftProgram((prev) => ({
        ...prev,
        durationWeeks: sanitized,
      }));
      onProgramChange({
        durationWeeks:
          sanitized.trim().length > 0 ? Number(sanitized) : undefined,
      });
    },
    [onProgramChange],
  );

  const addFrequencyTarget = useCallback(() => {
    setDraftFrequencySummary((prev) => {
      if (prev.length >= MAX_FREQUENCY_TARGETS) {
        return prev;
      }
      const next = [
        ...prev,
        {
          uiKey: createFrequencyUiKey(),
          muscleGroup:
            muscleGroups[prev.length % muscleGroups.length] ?? 'Chest',
          targetPerWeek: 2,
        },
      ];
      commitFrequencySummary(next);
      return next;
    });
  }, [commitFrequencySummary, createFrequencyUiKey]);

  const updateFrequencyTarget = useCallback(
    (
      uiKey: string,
      update: Partial<
        Pick<MuscleFrequencyTarget, 'muscleGroup' | 'targetPerWeek'>
      >,
    ) => {
      setDraftFrequencySummary((prev) => {
        const next = prev.map((item) =>
          item.uiKey === uiKey ? { ...item, ...update } : item,
        );
        commitFrequencySummary(next);
        return next;
      });
    },
    [commitFrequencySummary],
  );

  const removeFrequencyTarget = useCallback(
    (uiKey: string) => {
      setDraftFrequencySummary((prev) => {
        const next = prev.filter((item) => item.uiKey !== uiKey);
        commitFrequencySummary(next);
        return next;
      });
    },
    [commitFrequencySummary],
  );

  const content = (
    <View style={styles.container}>
      <View style={styles.header}>
        <AnimatedPressable
          style={styles.backButton}
          onPress={onClose}
          testID={E2E_IDS.programSettings.close}
        >
          <ChevronLeft size={22} color={tokens.colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.title}>{t('programSettings.title')}</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.listSection}>
          <View style={styles.tabRow}>
            <AnimatedPressable
              style={[
                styles.tabButton,
                activeTab === 'program' && styles.tabActive,
              ]}
              onPress={() => setActiveTab('program')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'program' && styles.tabTextActive,
                ]}
              >
                {t('programSettings.tabs.program')}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[
                styles.tabButton,
                activeTab === 'weeks' && styles.tabActive,
              ]}
              onPress={() => setActiveTab('weeks')}
              testID={E2E_IDS.programSettings.tabWeeks}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'weeks' && styles.tabTextActive,
                ]}
              >
                {t('programSettings.tabs.weeks')}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[
                styles.tabButton,
                activeTab === 'days' && styles.tabActive,
              ]}
              onPress={() => setActiveTab('days')}
              testID={E2E_IDS.programSettings.tabDays}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'days' && styles.tabTextActive,
                ]}
              >
                {t('programSettings.tabs.days')}
              </Text>
            </AnimatedPressable>
          </View>

          <View style={styles.listWrap}>
            <View
              style={[
                styles.listWrapper,
                activeTab !== 'program' && styles.listHidden,
              ]}
            >
              <Animated.ScrollView
                style={styles.list}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.listContent}
              >
                <View style={styles.card}>
                  <Text style={styles.sectionLabel}>
                    {t('programSettings.program.name')}
                  </Text>
                  <TextInput
                    value={draftProgram.name}
                    onChangeText={(text) =>
                      handleProgramFieldChange('name', text)
                    }
                    placeholder={t('programSettings.program.namePlaceholder')}
                    placeholderTextColor={tokens.colors.textMuted}
                    style={styles.input}
                  />

                  <Text style={styles.sectionLabel}>
                    {t('programSettings.program.subtitle')}
                  </Text>
                  <TextInput
                    value={draftProgram.subtitle}
                    onChangeText={(text) =>
                      handleProgramFieldChange('subtitle', text)
                    }
                    placeholder={t(
                      'programSettings.program.subtitlePlaceholder',
                    )}
                    placeholderTextColor={tokens.colors.textMuted}
                    style={styles.input}
                  />

                  <Text style={styles.sectionLabel}>
                    {t('programSettings.program.goal')}
                  </Text>
                  <TextInput
                    value={draftProgram.goal}
                    onChangeText={(text) =>
                      handleProgramFieldChange('goal', text)
                    }
                    placeholder={t('programSettings.program.goalPlaceholder')}
                    placeholderTextColor={tokens.colors.textMuted}
                    style={styles.input}
                  />

                  <Text style={styles.sectionLabel}>
                    {t('programSettings.program.description')}
                  </Text>
                  <TextInput
                    value={draftProgram.description}
                    onChangeText={(text) =>
                      handleProgramFieldChange('description', text)
                    }
                    placeholder={t(
                      'programSettings.program.descriptionPlaceholder',
                    )}
                    placeholderTextColor={tokens.colors.textMuted}
                    style={[styles.input, styles.programDescriptionInput]}
                    multiline
                  />

                  <Text style={styles.sectionLabel}>
                    {t('programSettings.program.sourceType')}
                  </Text>
                  <View style={styles.scheduleTypeRow}>
                    {sourceTypeOptions.map((value) => {
                      const active = draftProgram.sourceType === value;
                      return (
                        <AnimatedPressable
                          key={value}
                          style={[
                            styles.scheduleTypeButton,
                            active && styles.scheduleTypeButtonActive,
                          ]}
                          onPress={() => handleSourceTypeChange(value)}
                        >
                          <Text
                            style={[
                              styles.scheduleTypeText,
                              active && styles.scheduleTypeTextActive,
                            ]}
                          >
                            {t(`programSettings.program.sourceTypes.${value}`)}
                          </Text>
                        </AnimatedPressable>
                      );
                    })}
                  </View>

                  <Text style={styles.sectionLabel}>
                    {t('programSettings.program.sourceLabel')}
                  </Text>
                  <TextInput
                    value={draftProgram.sourceLabel}
                    onChangeText={(text) =>
                      handleProgramFieldChange('sourceLabel', text)
                    }
                    placeholder={t(
                      'programSettings.program.sourceLabelPlaceholder',
                    )}
                    placeholderTextColor={tokens.colors.textMuted}
                    style={styles.input}
                  />

                  <View style={styles.weekInputRow}>
                    <View style={styles.weekInputCol}>
                      <Text style={styles.sectionLabel}>
                        {t('programSettings.program.startDate')}
                      </Text>
                      <TextInput
                        value={draftProgram.startDate}
                        onChangeText={(text) =>
                          handleProgramFieldChange('startDate', text)
                        }
                        placeholder={t(
                          'programSettings.program.startDatePlaceholder',
                        )}
                        placeholderTextColor={tokens.colors.textMuted}
                        style={styles.input}
                      />
                    </View>
                    <View style={styles.weekInputCol}>
                      <Text style={styles.sectionLabel}>
                        {t('programSettings.program.durationWeeks')}
                      </Text>
                      <TextInput
                        value={draftProgram.durationWeeks}
                        onChangeText={handleDurationWeeksChange}
                        placeholder={t(
                          'programSettings.program.durationWeeksPlaceholder',
                        )}
                        placeholderTextColor={tokens.colors.textMuted}
                        style={styles.input}
                        keyboardType="number-pad"
                      />
                    </View>
                  </View>

                  <Text style={styles.sectionLabel}>
                    {t('programSettings.program.defaultRest')}
                  </Text>
                  <TextInput
                    value={draftProgram.defaultRestSeconds}
                    onChangeText={handleProgramRestChange}
                    placeholder={t(
                      'programSettings.program.defaultRestPlaceholder',
                    )}
                    placeholderTextColor={tokens.colors.textMuted}
                    style={styles.input}
                    keyboardType="number-pad"
                  />

                  <Text style={styles.sectionLabel}>
                    {t('programSettings.program.progressionModel')}
                  </Text>
                  <View style={styles.scheduleTypeRow}>
                    {progressionModelOptions.map((value) => {
                      const active = draftProgram.progressionModel === value;
                      return (
                        <AnimatedPressable
                          key={value}
                          style={[
                            styles.scheduleTypeButton,
                            active && styles.scheduleTypeButtonActive,
                          ]}
                          onPress={() => handleProgressionModelChange(value)}
                        >
                          <Text
                            style={[
                              styles.scheduleTypeText,
                              active && styles.scheduleTypeTextActive,
                            ]}
                          >
                            {t(
                              `programSettings.program.progressionModels.${value}`,
                            )}
                          </Text>
                        </AnimatedPressable>
                      );
                    })}
                  </View>

                  <Text style={styles.sectionLabel}>
                    {t('programSettings.program.frequencySummary')}
                  </Text>
                  {draftFrequencySummary.map((item) => (
                    <View key={item.uiKey} style={styles.frequencyCard}>
                      <View style={styles.cardHeader}>
                        <TextInput
                          value={item.muscleGroup}
                          onChangeText={(text) =>
                            updateFrequencyTarget(item.uiKey, {
                              muscleGroup: text,
                            })
                          }
                          placeholder={t(
                            'programSettings.program.frequencyGroupPlaceholder',
                          )}
                          placeholderTextColor={tokens.colors.textMuted}
                          style={styles.weekNameHeaderInput}
                        />
                        <AnimatedPressable
                          style={[styles.rowButton, styles.rowButtonDelete]}
                          hitSlop={8}
                          onPress={() => removeFrequencyTarget(item.uiKey)}
                        >
                          <Trash2
                            size={16}
                            color={tokens.colors.accentDanger}
                          />
                        </AnimatedPressable>
                      </View>
                      <Text style={styles.sectionLabel}>
                        {t('programSettings.program.frequencyTarget')}
                      </Text>
                      <View style={styles.loadControlRow}>
                        <AnimatedPressable
                          style={styles.stepButton}
                          onPress={() =>
                            updateFrequencyTarget(item.uiKey, {
                              targetPerWeek: Math.max(
                                1,
                                item.targetPerWeek - 1,
                              ),
                            })
                          }
                        >
                          <Minus
                            size={18}
                            color={tokens.colors.textSecondary}
                          />
                        </AnimatedPressable>
                        <View style={styles.loadValueWrap}>
                          <Text style={styles.loadValue}>
                            {t('programSettings.program.frequencyPerWeek', {
                              count: item.targetPerWeek,
                            })}
                          </Text>
                        </View>
                        <AnimatedPressable
                          style={styles.stepButton}
                          onPress={() =>
                            updateFrequencyTarget(item.uiKey, {
                              targetPerWeek: Math.min(
                                7,
                                item.targetPerWeek + 1,
                              ),
                            })
                          }
                        >
                          <Plus size={18} color={tokens.colors.textSecondary} />
                        </AnimatedPressable>
                      </View>
                    </View>
                  ))}
                  {draftFrequencySummary.length < MAX_FREQUENCY_TARGETS ? (
                    <AnimatedPressable
                      style={styles.ghostCard}
                      onPress={addFrequencyTarget}
                    >
                      <Plus
                        size={16}
                        color={withAlpha(tokens.colors.primary, 0.7)}
                      />
                      <Text style={styles.ghostCardText}>
                        {t('programSettings.program.addFrequencyTarget')}
                      </Text>
                    </AnimatedPressable>
                  ) : null}
                </View>
              </Animated.ScrollView>
            </View>
            <View
              style={[
                styles.listWrapper,
                activeTab !== 'weeks' && styles.listHidden,
              ]}
            >
              <Animated.ScrollView
                ref={weekScrollRef}
                style={styles.list}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.listContent}
              >
                <Sortable.Grid
                  enableActiveItemSnap={false}
                  data={draftWeeks}
                  keyExtractor={(item) => item.uiKey}
                  renderItem={renderWeekSortableItem}
                  columns={1}
                  rowGap={tokens.spacing.md}
                  scrollableRef={weekScrollRef}
                  dragActivationDelay={300}
                  activeItemScale={1.02}
                  dropAnimationDuration={200}
                  onDragEnd={({ data }) => {
                    const reordered = data.map((w, i) => ({
                      ...w,
                      id: i + 1,
                    }));
                    setDraftWeeks(reordered);
                    onWeekConfigsChange(toWeekConfigs(reordered));
                  }}
                />
                <AnimatedPressable
                  style={styles.ghostCard}
                  onPress={addWeek}
                  testID={E2E_IDS.programSettings.addWeek}
                >
                  <Plus
                    size={16}
                    color={withAlpha(tokens.colors.primary, 0.7)}
                  />
                  <Text style={styles.ghostCardText}>
                    {t('programSettings.week.addWeek')}
                  </Text>
                </AnimatedPressable>
              </Animated.ScrollView>
            </View>
            <View
              style={[
                styles.listWrapper,
                activeTab !== 'days' && styles.listHidden,
              ]}
            >
              <Animated.ScrollView
                ref={dayScrollRef}
                style={styles.list}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.listContent}
              >
                <Sortable.Grid
                  enableActiveItemSnap={false}
                  data={draftDays}
                  keyExtractor={(item) => item.id}
                  renderItem={renderDaySortableItem}
                  columns={1}
                  rowGap={tokens.spacing.md}
                  scrollableRef={dayScrollRef}
                  dragActivationDelay={300}
                  activeItemScale={1.02}
                  dropAnimationDuration={200}
                  onDragEnd={({ data: reordered }) => {
                    setDraftDays(reordered);
                    onDayConfigsChange(reordered);
                  }}
                />
                {draftDays.length < MAX_DAYS && (
                  <AnimatedPressable
                    style={styles.ghostCard}
                    onPress={addDay}
                    testID={E2E_IDS.programSettings.addDay}
                  >
                    <Plus
                      size={16}
                      color={withAlpha(tokens.colors.primary, 0.7)}
                    />
                    <Text style={styles.ghostCardText}>
                      {t('programSettings.day.addDay')}
                    </Text>
                  </AnimatedPressable>
                )}
              </Animated.ScrollView>
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  if (layout.isTablet) {
    return (
      <AnimatedModalShell
        open={open}
        onClose={onClose}
        slideFrom="right"
        containerStyle={styles.tabletPanelModalRoot}
        backdropStyle={styles.tabletPanelBackdrop}
        sheetStyle={styles.tabletPanelSheet}
      >
        {content}
      </AnimatedModalShell>
    );
  }

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
      {content}
    </AnimatedScreenModal>
  );
}

function createStyles(
  tokens: ThemeTokens,
  topInset: number,
  bottomInset: number,
  layout: ReturnType<typeof useResponsiveLayout>,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.colors.bgBase,
    },
    tabletPanelModalRoot: {
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
    },
    tabletPanelBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0, 0, 0, 0.34)',
    },
    tabletPanelSheet: {
      width: layout.isLandscape ? 560 : 500,
      height: '100%',
      overflow: 'hidden',
      borderTopLeftRadius: tokens.radius.xl,
      borderBottomLeftRadius: tokens.radius.xl,
    },
    header: {
      paddingTop: topInset + tokens.spacing.sm,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.outlineVariant,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.bgSurface,
    },
    backButtonPlaceholder: {
      width: 36,
      height: 36,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontFamily: 'SpaceGrotesk_700Bold',
    },
    content: {
      flex: 1,
      padding: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.lg,
      width: '100%',
    },
    listSection: {
      flex: 1,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    tabRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
    },
    tabButton: {
      flex: 1,
      borderRadius: tokens.radius.pill,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      alignItems: 'center',
      paddingVertical: tokens.spacing.sm,
    },
    tabActive: {
      borderColor: 'transparent',
      backgroundColor: withAlpha(tokens.colors.primary, 0.12),
    },
    tabText: {
      color: tokens.colors.textSecondary,
      fontFamily: 'SpaceGrotesk_700Bold',
      fontSize: tokens.type.body,
    },
    tabTextActive: {
      color: tokens.colors.primary,
    },
    listWrap: {
      flex: 1,
      minHeight: 0,
      overflow: 'hidden',
      position: 'relative',
    },
    listWrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1,
    },
    list: {
      flex: 1,
    },
    listHidden: {
      display: 'none',
      position: 'absolute',
      width: 0,
      height: 0,
      overflow: 'hidden',
    },
    listContent: {
      paddingTop: tokens.spacing.sm,
      paddingBottom: tokens.spacing.sm,
    },
    card: {
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    cardSpacing: {
      marginBottom: tokens.spacing.md,
    },
    cardPressable: {
      gap: tokens.spacing.sm,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    cardTitle: {
      flex: 1,
      color: tokens.colors.textPrimary,
      fontFamily: 'SpaceGrotesk_700Bold',
      fontSize: tokens.type.body,
    },
    weekNameHeaderInput: {
      flex: 1,
      height: 44,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      borderRadius: tokens.radius.sm,
      backgroundColor: tokens.colors.surfaceContainerHighest,
      color: tokens.colors.textPrimary,
      fontFamily: 'SpaceGrotesk_700Bold',
      fontSize: tokens.type.body,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 0,
    },
    sessionLabelInput: {
      width: 58,
      height: 44,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      borderRadius: tokens.radius.sm,
      backgroundColor: tokens.colors.surfaceContainerHighest,
      color: tokens.colors.textPrimary,
      fontFamily: 'SpaceGrotesk_700Bold',
      fontSize: tokens.type.label,
      paddingHorizontal: tokens.spacing.xs,
      paddingVertical: 0,
      textAlign: 'center',
    },
    rowButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rowButtonDelete: {
      backgroundColor: withAlpha(tokens.colors.error, 0.12),
    },
    rowButtonDisabled: {
      opacity: 0.5,
    },
    sectionLabel: {
      color: withAlpha(tokens.colors.textSecondary, 0.72),
      fontSize: tokens.type.label - 1,
      fontFamily: 'SpaceGrotesk_600SemiBold',
      marginTop: tokens.spacing.xs,
    },
    input: {
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      borderRadius: tokens.radius.sm,
      backgroundColor: tokens.colors.surfaceContainerHighest,
      color: tokens.colors.textPrimary,
      fontFamily: 'SpaceGrotesk_400Regular',
      fontSize: tokens.type.body,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 9,
    },
    textareaCompact: {
      minHeight: 72,
      textAlignVertical: 'top',
    },
    programDescriptionInput: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    loadControlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.xs,
    },
    stepButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHighest,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadValueWrap: {
      width: 148,
      height: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHighest,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: tokens.spacing.sm,
    },
    loadValue: {
      color: tokens.colors.textPrimary,
      fontFamily: 'SpaceGrotesk_700Bold',
      fontSize: tokens.type.body + 2,
      textAlign: 'center',
    },
    loadValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      width: '100%',
    },
    loadValueInput: {
      minWidth: 48,
      paddingVertical: 0,
      paddingHorizontal: 0,
      textAlign: 'center',
      color: tokens.colors.textPrimary,
      fontFamily: 'SpaceGrotesk_700Bold',
      fontSize: tokens.type.body + 2,
    },
    loadValueUnit: {
      color: tokens.colors.textSecondary,
      fontFamily: 'SpaceGrotesk_700Bold',
      fontSize: tokens.type.body + 2,
    },
    rirRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.xs,
    },
    rirButton: {
      flex: 1,
      height: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHighest,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rirButtonActive: {
      borderColor: tokens.colors.primary,
      backgroundColor: withAlpha(tokens.colors.primary, 0.14),
    },
    rirText: {
      color: tokens.colors.textSecondary,
      fontFamily: 'SpaceGrotesk_700Bold',
      fontSize: tokens.type.body,
    },
    rirTextActive: {
      color: tokens.colors.primary,
    },
    weekInputRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      alignItems: 'flex-start',
    },
    weekInputCol: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    frequencyCard: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHighest,
      padding: tokens.spacing.sm,
      gap: tokens.spacing.sm,
    },
    inputLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.type.label - 1,
      textAlign: 'center',
      fontFamily: 'SpaceGrotesk_600SemiBold',
    },
    iconGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing.xs,
      justifyContent: 'space-between',
      marginTop: tokens.spacing.xs,
    },
    iconOption: {
      flexBasis: '19%',
      minWidth: 44,
      height: 64,
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 6,
      backgroundColor: tokens.colors.surfaceContainerHighest,
    },
    iconOptionActive: {
      borderColor: tokens.colors.primary,
      backgroundColor: withAlpha(tokens.colors.primary, 0.15),
    },
    iconOptionMore: {
      borderRadius: 999,
      borderColor: withAlpha(tokens.colors.accentPrimary, 0.7),
      backgroundColor: withAlpha(tokens.colors.accentPrimary, 0.1),
    },
    iconLabel: {
      marginTop: 4,
      color: withAlpha(tokens.colors.textSecondary, 0.8),
      fontFamily: 'SpaceGrotesk_600SemiBold',
      fontSize: 10,
      lineHeight: 12,
      textAlign: 'center',
    },
    iconLabelActive: {
      color: tokens.colors.accentPrimary,
    },
    iconLabelCustom: {
      color: withAlpha(tokens.colors.accentPrimary, 0.9),
    },
    scheduleTypeRow: {
      flexDirection: 'row',
      gap: tokens.spacing.xs,
      marginTop: tokens.spacing.xs,
    },
    scheduleTypeButton: {
      flex: 1,
      minHeight: 40,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHighest,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: tokens.spacing.xs,
      paddingVertical: tokens.spacing.xs,
    },
    scheduleTypeButtonActive: {
      borderColor: tokens.colors.primary,
      backgroundColor: withAlpha(tokens.colors.primary, 0.14),
    },
    scheduleTypeText: {
      color: tokens.colors.textSecondary,
      fontFamily: 'SpaceGrotesk_700Bold',
      fontSize: tokens.type.label - 1,
      textAlign: 'center',
    },
    scheduleTypeTextActive: {
      color: tokens.colors.primary,
    },
    weekdayRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing.xs,
      marginTop: tokens.spacing.xs,
    },
    weekdayButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHighest,
      justifyContent: 'center',
      alignItems: 'center',
    },
    weekdayButtonActive: {
      borderColor: tokens.colors.primary,
      backgroundColor: withAlpha(tokens.colors.primary, 0.14),
    },
    weekdayText: {
      color: tokens.colors.textSecondary,
      fontFamily: 'SpaceGrotesk_700Bold',
      fontSize: tokens.type.label,
    },
    weekdayTextActive: {
      color: tokens.colors.primary,
    },
    ghostCard: {
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.primary, 0.35),
      borderStyle: 'dashed',
      backgroundColor: withAlpha(tokens.colors.primary, 0.06),
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      marginTop: tokens.spacing.md,
    },
    ghostCardText: {
      color: withAlpha(tokens.colors.primary, 0.7),
      fontFamily: 'SpaceGrotesk_600SemiBold',
      fontSize: tokens.type.body,
    },
  });
}
