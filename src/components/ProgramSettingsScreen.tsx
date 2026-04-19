import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import DraggableFlatList, {
  type RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
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
import { AnimatedScreenModal } from './AnimatedScreenModal';

interface ProgramSettingsScreenProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  weekConfigs: WeekConfig[];
  dayConfigs: DayConfig[];
  onClose: () => void;
  onWeekConfigsChange: (value: WeekConfig[]) => void;
  onDayConfigsChange: (value: DayConfig[]) => void;
}

type WeekDraft = WeekConfig & { uiKey: string };

const MAX_WEEKS = 4;
const MAX_DAYS = 7;

export function ProgramSettingsScreen({
  open,
  tokens,
  topInset,
  bottomInset,
  weekConfigs,
  dayConfigs,
  onClose,
  onWeekConfigsChange,
  onDayConfigsChange,
}: ProgramSettingsScreenProps) {
  const [activeTab, setActiveTab] = useState<'weeks' | 'days'>('weeks');
  const [draftWeeks, setDraftWeeks] = useState<WeekDraft[]>([]);
  const [draftDayConfigs, setDraftDayConfigs] = useState<DayConfig[]>([]);
  const weekUiKeyCounterRef = useRef(0);
  const dayIdCounterRef = useRef(0);
  const wasOpenRef = useRef(false);
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );

  const createWeekUiKey = useCallback(() => {
    const next = weekUiKeyCounterRef.current;
    weekUiKeyCounterRef.current += 1;
    return `week-ui-${next}`;
  }, []);

  const toWeekConfigs = useCallback(
    (weeks: WeekDraft[]): WeekConfig[] =>
      weeks.map((week, index) => ({
        id: index + 1,
        name: week.name,
        loadModifier: week.loadModifier,
        rir: week.rir,
      })),
    [],
  );

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) {
      return;
    }
    wasOpenRef.current = true;
    weekUiKeyCounterRef.current = 0;
    dayIdCounterRef.current = 0;
    setDraftWeeks(
      weekConfigs.map((week, index) => ({
        ...week,
        id: index + 1,
        uiKey: createWeekUiKey(),
      })),
    );
    setDraftDayConfigs(dayConfigs);
  }, [createWeekUiKey, dayConfigs, open, weekConfigs]);

  const updateWeek = useCallback(
    (uiKey: string, update: Partial<WeekConfig>) => {
      setDraftWeeks((prev) => {
        const next = prev.map((week) =>
          week.uiKey === uiKey ? { ...week, ...update } : week,
        );
        onWeekConfigsChange(toWeekConfigs(next));
        return next;
      });
    },
    [onWeekConfigsChange, toWeekConfigs],
  );

  const addWeek = useCallback(() => {
    setDraftWeeks((prev) => {
      if (prev.length >= MAX_WEEKS) return prev;
      const nextId = prev.length + 1;
      const next = [
        ...prev,
        {
          id: nextId,
          name: `Week ${nextId}`,
          loadModifier: 1,
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
      setDraftWeeks((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev
          .filter((week) => week.uiKey !== uiKey)
          .map((week, index) => ({ ...week, id: index + 1 }));
        onWeekConfigsChange(toWeekConfigs(next));
        return next;
      });
    },
    [onWeekConfigsChange, toWeekConfigs],
  );

  const updateDay = useCallback(
    (id: string, update: Partial<DayConfig>) => {
      setDraftDayConfigs((prev) => {
        const next = prev.map((day) =>
          day.id === id ? { ...day, ...update } : day,
        );
        onDayConfigsChange(next);
        return next;
      });
    },
    [onDayConfigsChange],
  );

  const addDay = useCallback(() => {
    setDraftDayConfigs((prev) => {
      if (prev.length >= MAX_DAYS) return prev;
      // Avoid `Date.now()` collisions when tapping quickly.
      const id = `day-${Date.now().toString(36)}-${dayIdCounterRef.current}`;
      dayIdCounterRef.current += 1;
      const next = [
        ...prev,
        { id, name: `Day ${prev.length + 1}`, icon: 'FitnessCenter' },
      ];
      onDayConfigsChange(next);
      return next;
    });
  }, [onDayConfigsChange]);

  const removeDay = useCallback(
    (index: number) => {
      setDraftDayConfigs((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((_, i) => i !== index);
        onDayConfigsChange(next);
        return next;
      });
    },
    [onDayConfigsChange],
  );

  const atLimit =
    activeTab === 'weeks'
      ? draftWeeks.length >= MAX_WEEKS
      : draftDayConfigs.length >= MAX_DAYS;

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={onClose}>
            <Feather
              name="chevron-left"
              size={22}
              color={tokens.colors.textPrimary}
            />
          </AnimatedPressable>
          <Text style={styles.title}>Program Settings</Text>
          <View style={styles.backButtonPlaceholder} />
        </View>

        <View style={styles.content}>
          <View style={styles.listSection}>
            <View style={styles.tabRow}>
              <AnimatedPressable
                style={[
                  styles.tabButton,
                  activeTab === 'weeks' && styles.tabActive,
                ]}
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
                style={[
                  styles.tabButton,
                  activeTab === 'days' && styles.tabActive,
                ]}
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

            <View style={styles.listWrap}>
              {activeTab === 'weeks' ? (
                <DraggableFlatList
                  data={draftWeeks}
                  keyExtractor={(item) => item.uiKey}
                  style={styles.list}
                  containerStyle={styles.listContainer}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.listContent}
                  ListEmptyComponent={
                    <Text style={styles.emptyText}>No weeks to edit.</Text>
                  }
                  activationDistance={12}
                  onDragEnd={({ data }) => {
                    const reordered = data.map((week, index) => ({
                      ...week,
                      id: index + 1,
                    }));
                    setDraftWeeks(reordered);
                    onWeekConfigsChange(toWeekConfigs(reordered));
                  }}
                  renderItem={({
                    item: week,
                    getIndex,
                    drag,
                    isActive,
                  }: RenderItemParams<WeekDraft>) => {
                    const index = getIndex() ?? 0;
                    return (
                      <ScaleDecorator activeScale={1.015}>
                        <Animated.View
                          style={[styles.card, isActive && styles.cardActive]}
                          layout={LinearTransition.reduceMotion(
                            ReduceMotion.System,
                          )}
                          entering={FadeInDown.duration(MOTION.duration.fast)
                            .delay(index * 40)
                            .reduceMotion(ReduceMotion.System)}
                          exiting={FadeOutUp.duration(
                            MOTION.duration.fast,
                          ).reduceMotion(ReduceMotion.System)}
                        >
                          <AnimatedPressable
                            style={styles.cardPressable}
                            pressScale={1}
                            onLongPress={drag}
                            delayLongPress={160}
                            disabled={!drag}
                          >
                            <View style={styles.cardHeader}>
                              <Text style={styles.cardTitle}>
                                Week {index + 1}
                              </Text>
                              <View style={styles.rowActions}>
                                <AnimatedPressable
                                  style={[
                                    styles.rowButton,
                                    styles.rowButtonDelete,
                                    draftWeeks.length <= 1 &&
                                      styles.rowButtonDisabled,
                                  ]}
                                  hitSlop={8}
                                  disabled={draftWeeks.length <= 1}
                                  onPress={() => removeWeek(week.uiKey)}
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
                                  onChangeText={(text) =>
                                    updateWeek(week.uiKey, { name: text })
                                  }
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
                                    updateWeek(week.uiKey, {
                                      loadModifier: Number(text) || 1,
                                    })
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
                                    updateWeek(week.uiKey, {
                                      rir: Number(text) || 0,
                                    })
                                  }
                                  style={styles.input}
                                  keyboardType="number-pad"
                                  placeholder="RIR"
                                  placeholderTextColor={tokens.colors.textMuted}
                                />
                                <Text style={styles.inputLabel}>RIR</Text>
                              </View>
                            </View>
                          </AnimatedPressable>
                        </Animated.View>
                      </ScaleDecorator>
                    );
                  }}
                />
              ) : (
                <DraggableFlatList
                  data={draftDayConfigs}
                  keyExtractor={(item) => item.id}
                  style={styles.list}
                  containerStyle={styles.listContainer}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.listContent}
                  ListEmptyComponent={
                    <Text style={styles.emptyText}>No days to edit.</Text>
                  }
                  activationDistance={12}
                  onDragEnd={({ data }) => {
                    setDraftDayConfigs(data);
                    onDayConfigsChange(data);
                  }}
                  renderItem={({
                    item: day,
                    getIndex,
                    drag,
                    isActive,
                  }: RenderItemParams<DayConfig>) => {
                    const index = getIndex() ?? 0;
                    return (
                      <ScaleDecorator activeScale={1.015}>
                        <Animated.View
                          style={[styles.card, isActive && styles.cardActive]}
                          layout={LinearTransition.reduceMotion(
                            ReduceMotion.System,
                          )}
                          entering={FadeInDown.duration(MOTION.duration.fast)
                            .delay(index * 40)
                            .reduceMotion(ReduceMotion.System)}
                          exiting={FadeOutUp.duration(
                            MOTION.duration.fast,
                          ).reduceMotion(ReduceMotion.System)}
                        >
                          <AnimatedPressable
                            style={styles.cardPressable}
                            pressScale={1}
                            onLongPress={drag}
                            delayLongPress={160}
                            disabled={!drag}
                          >
                            <View style={styles.cardHeader}>
                              <Text style={styles.cardTitle}>
                                Day {index + 1}
                              </Text>
                              <View style={styles.rowActions}>
                                <AnimatedPressable
                                  style={[
                                    styles.rowButton,
                                    styles.rowButtonDelete,
                                    draftDayConfigs.length <= 1 &&
                                      styles.rowButtonDisabled,
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
                              onChangeText={(text) =>
                                updateDay(day.id, { name: text })
                              }
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
                                    onPress={() =>
                                      updateDay(day.id, { icon: option })
                                    }
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
                          </AnimatedPressable>
                        </Animated.View>
                      </ScaleDecorator>
                    );
                  }}
                />
              )}
            </View>
          </View>
          <AnimatedPressable
            style={[styles.addButton, atLimit && styles.addButtonDisabled]}
            onPress={activeTab === 'weeks' ? addWeek : addDay}
            disabled={atLimit}
          >
            <Text
              style={[
                styles.addButtonText,
                atLimit && styles.addButtonTextDisabled,
              ]}
            >
              {activeTab === 'weeks' ? 'Add Week' : 'Add Day'}
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    </AnimatedScreenModal>
  );
}

function createStyles(
  tokens: ThemeTokens,
  topInset: number,
  bottomInset: number,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.colors.bgBase,
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
      fontWeight: '700',
    },
    content: {
      flex: 1,
      padding: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.lg,
    },
    listSection: {
      flex: 1,
      minHeight: 0,
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
      fontWeight: '700',
      fontSize: tokens.type.body,
    },
    tabTextActive: {
      color: tokens.colors.primary,
    },
    listWrap: {
      flex: 1,
      minHeight: 0,
      marginTop: tokens.spacing.xs,
      zIndex: 0,
    },
    list: {
      flex: 1,
    },
    listContainer: {
      alignSelf: 'stretch',
      flexGrow: 1,
    },
    listContent: {
      gap: tokens.spacing.md,
      paddingTop: tokens.spacing.sm,
      paddingBottom: tokens.spacing.xl * 2,
    },
    emptyText: {
      color: tokens.colors.textSecondary,
      textAlign: 'center',
      paddingVertical: tokens.spacing.lg,
      fontWeight: '600',
    },
    card: {
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    cardPressable: {
      gap: tokens.spacing.sm,
    },
    cardActive: {
      borderColor: withAlpha(tokens.colors.primary, 0.45),
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
    rowButtonDelete: {
      backgroundColor: '#291a1c',
    },
    rowButtonDisabled: {
      opacity: 0.5,
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
      width: '100%',
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      marginTop: 12,
    },
    addButtonDisabled: {
      backgroundColor: withAlpha(tokens.colors.primary, 0.3),
    },
    addButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    addButtonTextDisabled: {
      color: withAlpha(tokens.colors.onPrimary, 0.72),
    },
    addSection: {
      flexShrink: 0,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
    },
  });
}
