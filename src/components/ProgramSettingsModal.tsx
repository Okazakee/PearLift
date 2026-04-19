import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  ReduceMotion,
} from 'react-native-reanimated';
import { MOTION } from '../animation/motion';
import { AnimatedPressable } from '../animation/primitives';

import { dayIconMap, dayIconOptions } from '../data/workouts';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';
import type { DayConfig, WeekConfig } from '../types';
import { scheduleIdleTask } from '../utils/idle';
import { AnimatedModalShell } from './AnimatedModalShell';

interface ProgramSettingsModalProps {
  open: boolean;
  tokens: ThemeTokens;
  weekConfigs: WeekConfig[];
  dayConfigs: DayConfig[];
  onClose: () => void;
  onWeekConfigsChange: (value: WeekConfig[]) => void;
  onDayConfigsChange: (value: DayConfig[]) => void;
}

const AUTOSAVE_DELAY_MS = 240;

export function ProgramSettingsModal({
  open,
  tokens,
  weekConfigs,
  dayConfigs,
  onClose,
  onWeekConfigsChange,
  onDayConfigsChange,
}: ProgramSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'weeks' | 'days'>('weeks');
  const [draftWeekConfigs, setDraftWeekConfigs] = useState(weekConfigs);
  const [draftDayConfigs, setDraftDayConfigs] = useState(dayConfigs);
  const [weeksDirty, setWeeksDirty] = useState(false);
  const [daysDirty, setDaysDirty] = useState(false);
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const weekUiKeysRef = useRef<string[]>([]);
  const weekUiKeyCounterRef = useRef(0);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveIdleCancelRef = useRef<(() => void) | null>(null);
  const wasOpenRef = useRef(false);

  const createWeekUiKey = useCallback(() => {
    const next = weekUiKeyCounterRef.current;
    weekUiKeyCounterRef.current += 1;
    return `week-ui-${next}`;
  }, []);

  useEffect(() => {
    if (weekUiKeysRef.current.length === draftWeekConfigs.length) {
      return;
    }
    if (weekUiKeysRef.current.length < draftWeekConfigs.length) {
      const missing = draftWeekConfigs.length - weekUiKeysRef.current.length;
      weekUiKeysRef.current = [
        ...weekUiKeysRef.current,
        ...Array.from({ length: missing }, () => createWeekUiKey()),
      ];
      return;
    }
    weekUiKeysRef.current = weekUiKeysRef.current.slice(
      0,
      draftWeekConfigs.length,
    );
  }, [draftWeekConfigs.length, createWeekUiKey]);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        if (weeksDirty) {
          onWeekConfigsChange(draftWeekConfigs);
        }
        if (daysDirty) {
          onDayConfigsChange(draftDayConfigs);
        }
      }
      wasOpenRef.current = false;
      setWeeksDirty(false);
      setDaysDirty(false);
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      autosaveIdleCancelRef.current?.();
      autosaveIdleCancelRef.current = null;
      return;
    }
    if (wasOpenRef.current) {
      return;
    }
    wasOpenRef.current = true;
    setDraftWeekConfigs(weekConfigs);
    setDraftDayConfigs(dayConfigs);
    setWeeksDirty(false);
    setDaysDirty(false);
  }, [
    dayConfigs,
    daysDirty,
    draftDayConfigs,
    draftWeekConfigs,
    onDayConfigsChange,
    onWeekConfigsChange,
    open,
    weekConfigs,
    weeksDirty,
  ]);

  useEffect(() => {
    if (!open || (!weeksDirty && !daysDirty)) {
      return;
    }
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      autosaveIdleCancelRef.current?.();
      const weeksSnapshot = draftWeekConfigs;
      const daysSnapshot = draftDayConfigs;
      const commitWeeks = weeksDirty;
      const commitDays = daysDirty;
      setWeeksDirty(false);
      setDaysDirty(false);
      autosaveIdleCancelRef.current = scheduleIdleTask(() => {
        autosaveIdleCancelRef.current = null;
        if (commitWeeks) {
          onWeekConfigsChange(weeksSnapshot);
        }
        if (commitDays) {
          onDayConfigsChange(daysSnapshot);
        }
      });
      autosaveTimerRef.current = null;
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      autosaveIdleCancelRef.current?.();
      autosaveIdleCancelRef.current = null;
    };
  }, [
    daysDirty,
    draftDayConfigs,
    draftWeekConfigs,
    onDayConfigsChange,
    onWeekConfigsChange,
    open,
    weeksDirty,
  ]);

  const updateWeek = (index: number, update: Partial<WeekConfig>) => {
    setDraftWeekConfigs((prev) =>
      prev.map((week, i) => (i === index ? { ...week, ...update } : week)),
    );
    setWeeksDirty(true);
  };

  const moveWeek = (index: number, to: number) => {
    if (to < 0 || to >= draftWeekConfigs.length) return;
    const keyCopy = [...weekUiKeysRef.current];
    const [movedKey] = keyCopy.splice(index, 1);
    if (movedKey) {
      keyCopy.splice(to, 0, movedKey);
      weekUiKeysRef.current = keyCopy;
    }
    const copy = [...draftWeekConfigs];
    const [item] = copy.splice(index, 1);
    copy.splice(to, 0, item);
    setDraftWeekConfigs(copy.map((week, i) => ({ ...week, id: i + 1 })));
    setWeeksDirty(true);
  };

  const addWeek = () => {
    if (draftWeekConfigs.length >= 4) return;
    weekUiKeysRef.current = [...weekUiKeysRef.current, createWeekUiKey()];
    const nextId = draftWeekConfigs.length + 1;
    setDraftWeekConfigs([
      ...draftWeekConfigs,
      { id: nextId, name: `Week ${nextId}`, loadModifier: 1, rir: 2 },
    ]);
    setWeeksDirty(true);
  };

  const removeWeek = (index: number) => {
    if (draftWeekConfigs.length <= 1) return;
    const keyCopy = [...weekUiKeysRef.current];
    keyCopy.splice(index, 1);
    weekUiKeysRef.current = keyCopy;
    const next = draftWeekConfigs
      .filter((_, i) => i !== index)
      .map((week, i) => ({ ...week, id: i + 1 }));
    setDraftWeekConfigs(next);
    setWeeksDirty(true);
  };

  const updateDay = (index: number, update: Partial<DayConfig>) => {
    setDraftDayConfigs((prev) =>
      prev.map((day, i) => (i === index ? { ...day, ...update } : day)),
    );
    setDaysDirty(true);
  };

  const moveDay = (index: number, to: number) => {
    if (to < 0 || to >= draftDayConfigs.length) return;
    const copy = [...draftDayConfigs];
    const [item] = copy.splice(index, 1);
    copy.splice(to, 0, item);
    setDraftDayConfigs(copy);
    setDaysDirty(true);
  };

  const addDay = () => {
    if (draftDayConfigs.length >= 7) return;
    const id = `day-${Date.now().toString(36)}`;
    setDraftDayConfigs([
      ...draftDayConfigs,
      { id, name: `Day ${draftDayConfigs.length + 1}`, icon: 'FitnessCenter' },
    ]);
    setDaysDirty(true);
  };

  const removeDay = (index: number) => {
    if (draftDayConfigs.length <= 1) return;
    setDraftDayConfigs(draftDayConfigs.filter((_, i) => i !== index));
    setDaysDirty(true);
  };

  const atLimit =
    activeTab === 'weeks'
      ? draftWeekConfigs.length >= 4
      : draftDayConfigs.length >= 7;
  const handleClose = () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    autosaveIdleCancelRef.current?.();
    autosaveIdleCancelRef.current = null;
    if (weeksDirty) {
      onWeekConfigsChange(draftWeekConfigs);
      setWeeksDirty(false);
    }
    if (daysDirty) {
      onDayConfigsChange(draftDayConfigs);
      setDaysDirty(false);
    }
    onClose();
  };

  return (
    <AnimatedModalShell
      open={open}
      onClose={handleClose}
      containerStyle={styles.modalRoot}
      backdropStyle={styles.backdrop}
      sheetStyle={styles.sheet}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Program Settings</Text>
        <AnimatedPressable style={styles.closeButton} onPress={handleClose}>
          <Feather name="x" size={18} color={tokens.colors.textSecondary} />
        </AnimatedPressable>
      </View>

      <View style={styles.tabRow}>
        <AnimatedPressable
          style={[styles.tabButton, activeTab === 'weeks' && styles.tabActive]}
          onPress={() => setActiveTab('weeks')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'weeks' && styles.tabTextActive,
            ]}
          >
            Weeks
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.tabButton, activeTab === 'days' && styles.tabActive]}
          onPress={() => setActiveTab('days')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'days' && styles.tabTextActive,
            ]}
          >
            Days
          </Text>
        </AnimatedPressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'weeks' &&
          draftWeekConfigs.map((week, index) => (
            <Animated.View
              key={weekUiKeysRef.current[index] ?? `week-ui-fallback-${index}`}
              style={styles.card}
              layout={LinearTransition.reduceMotion(ReduceMotion.System)}
              entering={FadeInDown.duration(MOTION.duration.fast).reduceMotion(
                ReduceMotion.System,
              )}
              exiting={FadeOutUp.duration(MOTION.duration.fast).reduceMotion(
                ReduceMotion.System,
              )}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Week {index + 1}</Text>
                <View style={styles.rowActions}>
                  <AnimatedPressable
                    style={[
                      styles.rowButton,
                      styles.rowButtonArrow,
                      index === 0 && styles.rowButtonDisabled,
                    ]}
                    hitSlop={8}
                    disabled={index === 0}
                    onPress={() => moveWeek(index, index - 1)}
                  >
                    <Feather
                      name="chevron-up"
                      size={14}
                      color={
                        index === 0
                          ? tokens.colors.textMuted
                          : tokens.colors.textSecondary
                      }
                    />
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={[
                      styles.rowButton,
                      styles.rowButtonArrow,
                      index === draftWeekConfigs.length - 1 &&
                        styles.rowButtonDisabled,
                    ]}
                    hitSlop={8}
                    disabled={index === draftWeekConfigs.length - 1}
                    onPress={() => moveWeek(index, index + 1)}
                  >
                    <Feather
                      name="chevron-down"
                      size={14}
                      color={
                        index === draftWeekConfigs.length - 1
                          ? tokens.colors.textMuted
                          : tokens.colors.textSecondary
                      }
                    />
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={[
                      styles.rowButton,
                      styles.rowButtonDelete,
                      draftWeekConfigs.length <= 1 && styles.rowButtonDisabled,
                    ]}
                    hitSlop={8}
                    disabled={draftWeekConfigs.length <= 1}
                    onPress={() => removeWeek(index)}
                  >
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={16}
                      color={tokens.colors.accentDanger}
                    />
                  </AnimatedPressable>
                </View>
              </View>

              <View style={styles.weekInputRow}>
                <View style={styles.weekInputCol}>
                  <TextInput
                    value={week.name}
                    onChangeText={(text) => updateWeek(index, { name: text })}
                    style={styles.input}
                    placeholder="Week name"
                    placeholderTextColor={tokens.colors.textMuted}
                  />
                  <Text style={styles.inputLabel}>Week Name</Text>
                </View>
                <View style={styles.weekInputCol}>
                  <TextInput
                    value={String(week.loadModifier)}
                    onChangeText={(text) =>
                      updateWeek(index, { loadModifier: Number(text) || 1 })
                    }
                    style={styles.input}
                    keyboardType="decimal-pad"
                    placeholder="Load"
                    placeholderTextColor={tokens.colors.textMuted}
                  />
                  <Text style={styles.inputLabel}>Load</Text>
                </View>
                <View style={styles.weekInputCol}>
                  <TextInput
                    value={String(week.rir)}
                    onChangeText={(text) =>
                      updateWeek(index, { rir: Number(text) || 0 })
                    }
                    style={styles.input}
                    keyboardType="number-pad"
                    placeholder="RIR"
                    placeholderTextColor={tokens.colors.textMuted}
                  />
                  <Text style={styles.inputLabel}>RIR</Text>
                </View>
              </View>
            </Animated.View>
          ))}

        {activeTab === 'days' &&
          draftDayConfigs.map((day, index) => (
            <Animated.View
              key={day.id}
              style={styles.card}
              layout={LinearTransition.reduceMotion(ReduceMotion.System)}
              entering={FadeInDown.duration(MOTION.duration.fast).reduceMotion(
                ReduceMotion.System,
              )}
              exiting={FadeOutUp.duration(MOTION.duration.fast).reduceMotion(
                ReduceMotion.System,
              )}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Day {index + 1}</Text>
                <View style={styles.rowActions}>
                  <AnimatedPressable
                    style={[
                      styles.rowButton,
                      styles.rowButtonArrow,
                      index === 0 && styles.rowButtonDisabled,
                    ]}
                    hitSlop={8}
                    disabled={index === 0}
                    onPress={() => moveDay(index, index - 1)}
                  >
                    <Feather
                      name="chevron-up"
                      size={14}
                      color={
                        index === 0
                          ? tokens.colors.textMuted
                          : tokens.colors.textSecondary
                      }
                    />
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={[
                      styles.rowButton,
                      styles.rowButtonArrow,
                      index === draftDayConfigs.length - 1 &&
                        styles.rowButtonDisabled,
                    ]}
                    hitSlop={8}
                    disabled={index === draftDayConfigs.length - 1}
                    onPress={() => moveDay(index, index + 1)}
                  >
                    <Feather
                      name="chevron-down"
                      size={14}
                      color={
                        index === draftDayConfigs.length - 1
                          ? tokens.colors.textMuted
                          : tokens.colors.textSecondary
                      }
                    />
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={[
                      styles.rowButton,
                      styles.rowButtonDelete,
                      draftDayConfigs.length <= 1 && styles.rowButtonDisabled,
                    ]}
                    hitSlop={8}
                    disabled={draftDayConfigs.length <= 1}
                    onPress={() => removeDay(index)}
                  >
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={16}
                      color={tokens.colors.accentDanger}
                    />
                  </AnimatedPressable>
                </View>
              </View>

              <TextInput
                value={day.name}
                onChangeText={(text) => updateDay(index, { name: text })}
                style={styles.input}
                placeholder="Day name"
                placeholderTextColor={tokens.colors.textMuted}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.iconRow}
                nestedScrollEnabled
              >
                {dayIconOptions.map((option) => {
                  const active = day.icon === option;
                  const iconName = dayIconMap[option];
                  return (
                    <AnimatedPressable
                      key={option}
                      style={[
                        styles.iconOption,
                        active && styles.iconOptionActive,
                      ]}
                      hitSlop={8}
                      onPress={() => updateDay(index, { icon: option })}
                    >
                      <Feather
                        name={iconName as never}
                        size={18}
                        color={
                          active
                            ? tokens.colors.accentPrimary
                            : tokens.colors.textSecondary
                        }
                      />
                    </AnimatedPressable>
                  );
                })}
              </ScrollView>
            </Animated.View>
          ))}
      </ScrollView>

      {!atLimit && (
        <AnimatedPressable
          style={styles.addButton}
          onPress={activeTab === 'weeks' ? addWeek : addDay}
        >
          <Text style={styles.addButtonText}>
            {activeTab === 'weeks' ? 'Add Week' : 'Add Day'}
          </Text>
        </AnimatedPressable>
      )}
    </AnimatedModalShell>
  );
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    modalRoot: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: tokens.spacing.lg,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheet: {
      width: '100%',
      maxWidth: 640,
      maxHeight: '88%',
      backgroundColor: tokens.colors.surfaceContainer,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: tokens.spacing.lg,
      paddingBottom: tokens.spacing.lg,
    },
    header: {
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
    tabRow: {
      marginTop: tokens.spacing.md,
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
      fontWeight: '700',
      fontSize: tokens.type.body,
    },
    tabTextActive: {
      color: tokens.colors.primary,
    },
    content: {
      gap: tokens.spacing.md,
      paddingTop: tokens.spacing.md,
      paddingBottom: tokens.spacing.md,
    },
    card: {
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardTitle: {
      color: tokens.colors.textPrimary,
      fontFamily: 'SpaceGrotesk_700Bold',
      fontSize: tokens.type.body,
    },
    rowActions: {
      flexDirection: 'row',
      gap: tokens.spacing.xs,
    },
    rowButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rowButtonArrow: {
      backgroundColor: '#1a1a1e',
    },
    rowButtonDelete: {
      backgroundColor: '#291a1c',
    },
    rowButtonDisabled: {
      opacity: 0.5,
    },
    input: {
      flex: 1,
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
    inputRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
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
    inputLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.type.label - 1,
      textAlign: 'center',
      fontFamily: 'SpaceGrotesk_600SemiBold',
    },
    iconRow: {
      flexDirection: 'row',
      gap: tokens.spacing.xs,
      paddingRight: tokens.spacing.xs,
    },
    iconOption: {
      width: 44,
      height: 44,
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: tokens.colors.surfaceContainerHighest,
    },
    iconOptionActive: {
      borderColor: tokens.colors.primary,
      backgroundColor: withAlpha(tokens.colors.primary, 0.15),
    },
    addButton: {
      marginTop: tokens.spacing.sm,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      paddingVertical: tokens.spacing.md,
      alignItems: 'center',
    },
    addButtonText: {
      color: tokens.colors.onPrimary,
      fontWeight: '700',
      fontSize: tokens.type.body,
    },
  });
}
