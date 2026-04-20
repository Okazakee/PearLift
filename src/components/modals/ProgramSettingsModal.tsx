import {
  Activity,
  ChevronLeft,
  Clock,
  Heart,
  Navigation,
  Plus,
  RefreshCw,
  Repeat,
  Star,
  Trash2,
} from 'lucide-react-native';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';
import { AnimatedPressable } from '../../animation/primitives';
import { dayIconMap, dayIconOptions } from '../../data/workouts';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import type { DayConfig, WeekConfig } from '../../types';
import { scheduleIdleTask } from '../../utils/idle';
import { AnimatedScreenModal } from '../AnimatedScreenModal';

interface ProgramSettingsModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  weekConfigs: WeekConfig[];
  dayConfigs: DayConfig[];
  onClose: () => void;
  onWeekConfigsChange: (value: WeekConfig[]) => void;
  onDayConfigsChange: (value: DayConfig[]) => void;
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

const MAX_WEEKS = 4;
const MAX_DAYS = 7;

const dayIconComponents: Record<
  string,
  React.ComponentType<{ size: number; color: string }>
> = {
  Activity,
  Clock,
  Heart,
  Navigation,
  RefreshCw,
  Repeat,
  Star,
};

export function ProgramSettingsModal({
  open,
  tokens,
  topInset,
  bottomInset,
  weekConfigs,
  dayConfigs,
  onClose,
  onWeekConfigsChange,
  onDayConfigsChange,
  onPrompt,
}: ProgramSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'weeks' | 'days'>('weeks');
  const [draftWeeks, setDraftWeeks] = useState<WeekDraft[]>([]);
  const [draftDays, setDraftDays] = useState<DayConfig[]>([]);
  const weekUiKeyCounterRef = useRef(0);
  const dayIdCounterRef = useRef(0);
  const wasOpenRef = useRef(false);
  const pendingWeekPersistCancelRef = useRef<(() => void) | null>(null);
  const pendingDayPersistCancelRef = useRef<(() => void) | null>(null);

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
      weeks.map((w, i) => ({
        id: i + 1,
        name: w.name,
        loadModifier: w.loadModifier,
        rir: w.rir,
      })),
    [],
  );

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      pendingWeekPersistCancelRef.current?.();
      pendingWeekPersistCancelRef.current = null;
      pendingDayPersistCancelRef.current?.();
      pendingDayPersistCancelRef.current = null;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    weekUiKeyCounterRef.current = 0;
    dayIdCounterRef.current = 0;
    setDraftWeeks(
      weekConfigs.map((w, i) => ({
        ...w,
        id: i + 1,
        uiKey: createWeekUiKey(),
      })),
    );
    setDraftDays(dayConfigs);
  }, [createWeekUiKey, dayConfigs, open, weekConfigs]);

  useEffect(
    () => () => {
      pendingWeekPersistCancelRef.current?.();
      pendingWeekPersistCancelRef.current = null;
      pendingDayPersistCancelRef.current?.();
      pendingDayPersistCancelRef.current = null;
    },
    [],
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
      if (prev.length >= MAX_WEEKS) return prev;
      const nextId = prev.length + 1;
      const next: WeekDraft[] = [
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
      const week = draftWeeks.find((w) => w.uiKey === uiKey);
      if (!week) return;
      onPrompt('Delete week', `Delete "${week.name}"?`, [
        { label: 'Cancel', tone: 'cancel', onPress: () => {} },
        {
          label: 'Delete',
          tone: 'destructive',
          onPress: () => {
            setDraftWeeks((prev) => {
              if (prev.length <= 1) return prev;
              const next = prev
                .filter((w) => w.uiKey !== uiKey)
                .map((w, i) => ({ ...w, id: i + 1 }));
              onWeekConfigsChange(toWeekConfigs(next));
              return next;
            });
          },
        },
      ]);
    },
    [draftWeeks, onWeekConfigsChange, toWeekConfigs, onPrompt],
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
        'Delete day',
        `Delete "${day.name}"? This removes it from all weeks.`,
        [
          { label: 'Cancel', tone: 'cancel', onPress: () => {} },
          {
            label: 'Delete',
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
    [draftDays, onDayConfigsChange, onPrompt],
  );

  const weekScrollRef = useAnimatedRef<Animated.ScrollView>();
  const dayScrollRef = useAnimatedRef<Animated.ScrollView>();

  const renderWeekItem = useCallback(
    ({ item: week, index }: { item: WeekDraft; index: number }) => (
      <View style={styles.card}>
        <AnimatedPressable style={styles.cardPressable} pressScale={1}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Week {index + 1}</Text>
            <AnimatedPressable
              style={[
                styles.rowButton,
                styles.rowButtonDelete,
                draftWeeks.length <= 1 && styles.rowButtonDisabled,
              ]}
              hitSlop={8}
              disabled={draftWeeks.length <= 1}
              onPress={() => removeWeek(week.uiKey)}
              pointerEvents="box-only"
            >
              <Trash2 size={16} color={tokens.colors.accentDanger} />
            </AnimatedPressable>
          </View>

          <View style={styles.weekInputRow}>
            <View style={styles.weekInputCol}>
              <TextInput
                value={week.name}
                onChangeText={(text) => updateWeek(week.uiKey, { name: text })}
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
      </View>
    ),
    [
      draftWeeks.length,
      removeWeek,
      styles,
      tokens.colors.accentDanger,
      tokens.colors.textMuted,
      updateWeek,
    ],
  );

  const renderDayItem = useCallback(
    ({ item: day, index }: { item: DayConfig; index: number }) => (
      <View style={styles.card}>
        <AnimatedPressable style={styles.cardPressable} pressScale={1}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Day {index + 1}</Text>
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
            >
              <Trash2 size={16} color={tokens.colors.accentDanger} />
            </AnimatedPressable>
          </View>

          <TextInput
            value={day.name}
            onChangeText={(text) => updateDay(day.id, { name: text })}
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
              const IconComponent = dayIconComponents[dayIconMap[option]];
              return (
                <AnimatedPressable
                  key={option}
                  style={[styles.iconOption, active && styles.iconOptionActive]}
                  hitSlop={4}
                  onPress={() => updateDay(day.id, { icon: option })}
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
                </AnimatedPressable>
              );
            })}
          </ScrollView>
        </AnimatedPressable>
      </View>
    ),
    [
      draftDays.length,
      removeDay,
      styles,
      tokens.colors.accentDanger,
      tokens.colors.accentPrimary,
      tokens.colors.textMuted,
      tokens.colors.textSecondary,
      updateDay,
    ],
  );

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={onClose}>
            <ChevronLeft size={22} color={tokens.colors.textPrimary} />
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
                    data={draftWeeks}
                    keyExtractor={(item) => item.uiKey}
                    renderItem={renderWeekItem}
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
                      pendingWeekPersistCancelRef.current?.();
                      pendingWeekPersistCancelRef.current = scheduleIdleTask(
                        () => {
                          pendingWeekPersistCancelRef.current = null;
                          onWeekConfigsChange(toWeekConfigs(reordered));
                        },
                      );
                    }}
                  />
                  {draftWeeks.length < MAX_WEEKS && (
                    <AnimatedPressable
                      style={styles.ghostCard}
                      onPress={addWeek}
                    >
                      <Plus
                        size={16}
                        color={withAlpha(tokens.colors.primary, 0.7)}
                      />
                      <Text style={styles.ghostCardText}>Add Week</Text>
                    </AnimatedPressable>
                  )}
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
                    data={draftDays}
                    keyExtractor={(item) => item.id}
                    renderItem={renderDayItem}
                    columns={1}
                    rowGap={tokens.spacing.md}
                    scrollableRef={dayScrollRef}
                    dragActivationDelay={300}
                    activeItemScale={1.02}
                    dropAnimationDuration={200}
                    onDragEnd={({ data: reordered }) => {
                      setDraftDays(reordered);
                      pendingDayPersistCancelRef.current?.();
                      pendingDayPersistCancelRef.current = scheduleIdleTask(
                        () => {
                          pendingDayPersistCancelRef.current = null;
                          onDayConfigsChange(reordered);
                        },
                      );
                    }}
                  />
                  {draftDays.length < MAX_DAYS && (
                    <AnimatedPressable
                      style={styles.ghostCard}
                      onPress={addDay}
                    >
                      <Plus
                        size={16}
                        color={withAlpha(tokens.colors.primary, 0.7)}
                      />
                      <Text style={styles.ghostCardText}>Add Day</Text>
                    </AnimatedPressable>
                  )}
                </Animated.ScrollView>
              </View>
            </View>
          </View>
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
      fontFamily: 'SpaceGrotesk_700Bold',
    },
    content: {
      flex: 1,
      padding: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.lg,
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
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardTitle: {
      color: tokens.colors.textPrimary,
      fontFamily: 'SpaceGrotesk_700Bold',
      fontSize: tokens.type.body,
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
