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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import type { SortableGridRenderItem } from 'react-native-sortables';
import Sortable from 'react-native-sortables';
import { AnimatedPressable } from '../../animation/primitives';
import { dayIconMap, dayIconOptions } from '../../data/workouts';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import type { DayConfig, WeekConfig } from '../../types';
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
  Dumbbell,
  Flame,
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
  const [editingLoadWeekKey, setEditingLoadWeekKey] = useState<string | null>(
    null,
  );
  const [editingLoadText, setEditingLoadText] = useState('');
  const weekUiKeyCounterRef = useRef(0);
  const dayIdCounterRef = useRef(0);
  const wasOpenRef = useRef(false);

  const { t } = useTranslation();
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
      setEditingLoadWeekKey(null);
      setEditingLoadText('');
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
                if (prev.length <= 1) return prev;
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

      return (
        <View style={styles.card}>
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
              />

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
          </View>
        </View>
      );
    },
    [
      draftWeeks.length,
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

      return (
        <View style={styles.card}>
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
          </View>
        </View>
      );
    },
    [
      draftDays.length,
      removeDay,
      styles,
      t,
      tokens.colors.accentDanger,
      tokens.colors.accentPrimary,
      tokens.colors.textMuted,
      tokens.colors.textSecondary,
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

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={onClose}>
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
                  {t('programSettings.tabs.weeks')}
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
                  {t('programSettings.tabs.days')}
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
                  {draftWeeks.length < MAX_WEEKS && (
                    <AnimatedPressable
                      style={styles.ghostCard}
                      onPress={addWeek}
                    >
                      <Plus
                        size={16}
                        color={withAlpha(tokens.colors.primary, 0.7)}
                      />
                      <Text style={styles.ghostCardText}>
                        {t('programSettings.week.addWeek')}
                      </Text>
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
