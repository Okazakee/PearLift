import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { dayIconMap, dayIconOptions } from '../data/workouts';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';
import type { DayConfig, WeekConfig } from '../types';

interface ProgramSettingsModalProps {
  open: boolean;
  tokens: ThemeTokens;
  weekConfigs: WeekConfig[];
  dayConfigs: DayConfig[];
  onClose: () => void;
  onWeekConfigsChange: (value: WeekConfig[]) => void;
  onDayConfigsChange: (value: DayConfig[]) => void;
}

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
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const updateWeek = (index: number, update: Partial<WeekConfig>) => {
    onWeekConfigsChange(
      weekConfigs.map((week, i) =>
        i === index ? { ...week, ...update } : week,
      ),
    );
  };

  const moveWeek = (index: number, to: number) => {
    if (to < 0 || to >= weekConfigs.length) return;
    const copy = [...weekConfigs];
    const [item] = copy.splice(index, 1);
    copy.splice(to, 0, item);
    onWeekConfigsChange(copy.map((week, i) => ({ ...week, id: i + 1 })));
  };

  const addWeek = () => {
    if (weekConfigs.length >= 4) return;
    const nextId = weekConfigs.length + 1;
    onWeekConfigsChange([
      ...weekConfigs,
      { id: nextId, name: `Week ${nextId}`, loadModifier: 1, rir: 2 },
    ]);
  };

  const removeWeek = (index: number) => {
    if (weekConfigs.length <= 1) return;
    const next = weekConfigs
      .filter((_, i) => i !== index)
      .map((week, i) => ({ ...week, id: i + 1 }));
    onWeekConfigsChange(next);
  };

  const updateDay = (index: number, update: Partial<DayConfig>) => {
    onDayConfigsChange(
      dayConfigs.map((day, i) => (i === index ? { ...day, ...update } : day)),
    );
  };

  const moveDay = (index: number, to: number) => {
    if (to < 0 || to >= dayConfigs.length) return;
    const copy = [...dayConfigs];
    const [item] = copy.splice(index, 1);
    copy.splice(to, 0, item);
    onDayConfigsChange(copy);
  };

  const addDay = () => {
    if (dayConfigs.length >= 7) return;
    const id = `day-${Date.now().toString(36)}`;
    onDayConfigsChange([
      ...dayConfigs,
      { id, name: `Day ${dayConfigs.length + 1}`, icon: 'FitnessCenter' },
    ]);
  };

  const removeDay = (index: number) => {
    if (dayConfigs.length <= 1) return;
    onDayConfigsChange(dayConfigs.filter((_, i) => i !== index));
  };

  const atLimit =
    activeTab === 'weeks' ? weekConfigs.length >= 4 : dayConfigs.length >= 7;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Program Settings</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <MaterialIcons
                name="close"
                size={18}
                color={tokens.colors.textSecondary}
              />
            </Pressable>
          </View>

          <View style={styles.tabRow}>
            <Pressable
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
            </Pressable>
            <Pressable
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
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {activeTab === 'weeks' &&
              weekConfigs.map((week, index) => (
                <View key={week.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>Week {index + 1}</Text>
                    <View style={styles.rowActions}>
                      <Pressable
                        style={styles.rowButton}
                        disabled={index === 0}
                        onPress={() => moveWeek(index, index - 1)}
                      >
                        <MaterialIcons
                          name="arrow-upward"
                          size={16}
                          color={
                            index === 0
                              ? tokens.colors.textMuted
                              : tokens.colors.textSecondary
                          }
                        />
                      </Pressable>
                      <Pressable
                        style={styles.rowButton}
                        disabled={index === weekConfigs.length - 1}
                        onPress={() => moveWeek(index, index + 1)}
                      >
                        <MaterialIcons
                          name="arrow-downward"
                          size={16}
                          color={
                            index === weekConfigs.length - 1
                              ? tokens.colors.textMuted
                              : tokens.colors.textSecondary
                          }
                        />
                      </Pressable>
                      <Pressable
                        style={styles.rowButton}
                        disabled={weekConfigs.length <= 1}
                        onPress={() => removeWeek(index)}
                      >
                        <MaterialIcons
                          name="delete-outline"
                          size={16}
                          color={tokens.colors.accentDanger}
                        />
                      </Pressable>
                    </View>
                  </View>

                  <TextInput
                    value={week.name}
                    onChangeText={(text) => updateWeek(index, { name: text })}
                    style={styles.input}
                    placeholder="Week name"
                    placeholderTextColor={tokens.colors.textMuted}
                  />
                  <View style={styles.inputRow}>
                    <TextInput
                      value={String(week.loadModifier)}
                      onChangeText={(text) =>
                        updateWeek(index, { loadModifier: Number(text) || 1 })
                      }
                      style={styles.input}
                      keyboardType="decimal-pad"
                      placeholder="Load modifier"
                      placeholderTextColor={tokens.colors.textMuted}
                    />
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
                  </View>
                </View>
              ))}

            {activeTab === 'days' &&
              dayConfigs.map((day, index) => (
                <View key={day.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>Day {index + 1}</Text>
                    <View style={styles.rowActions}>
                      <Pressable
                        style={styles.rowButton}
                        disabled={index === 0}
                        onPress={() => moveDay(index, index - 1)}
                      >
                        <MaterialIcons
                          name="arrow-upward"
                          size={16}
                          color={
                            index === 0
                              ? tokens.colors.textMuted
                              : tokens.colors.textSecondary
                          }
                        />
                      </Pressable>
                      <Pressable
                        style={styles.rowButton}
                        disabled={index === dayConfigs.length - 1}
                        onPress={() => moveDay(index, index + 1)}
                      >
                        <MaterialIcons
                          name="arrow-downward"
                          size={16}
                          color={
                            index === dayConfigs.length - 1
                              ? tokens.colors.textMuted
                              : tokens.colors.textSecondary
                          }
                        />
                      </Pressable>
                      <Pressable
                        style={styles.rowButton}
                        disabled={dayConfigs.length <= 1}
                        onPress={() => removeDay(index)}
                      >
                        <MaterialIcons
                          name="delete-outline"
                          size={16}
                          color={tokens.colors.accentDanger}
                        />
                      </Pressable>
                    </View>
                  </View>

                  <TextInput
                    value={day.name}
                    onChangeText={(text) => updateDay(index, { name: text })}
                    style={styles.input}
                    placeholder="Day name"
                    placeholderTextColor={tokens.colors.textMuted}
                  />
                  <View style={styles.iconGrid}>
                    {dayIconOptions.map((option) => {
                      const active = day.icon === option;
                      const iconName = dayIconMap[option];
                      return (
                        <Pressable
                          key={option}
                          style={[
                            styles.iconOption,
                            active && styles.iconOptionActive,
                          ]}
                          onPress={() => updateDay(index, { icon: option })}
                        >
                          <MaterialIcons
                            name={iconName as never}
                            size={18}
                            color={
                              active
                                ? tokens.colors.accentPrimary
                                : tokens.colors.textSecondary
                            }
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
          </ScrollView>

          <Pressable
            style={[styles.addButton, atLimit && styles.addButtonDisabled]}
            onPress={
              atLimit ? undefined : activeTab === 'weeks' ? addWeek : addDay
            }
            disabled={atLimit}
          >
            <Text style={styles.addButtonText}>
              {activeTab === 'weeks' ? 'Add Week' : 'Add Day'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
      borderColor: tokens.colors.primary,
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
      fontWeight: '700',
      fontSize: tokens.type.body,
    },
    rowActions: {
      flexDirection: 'row',
      gap: tokens.spacing.xs,
    },
    rowButton: {
      width: 30,
      height: 30,
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      justifyContent: 'center',
      alignItems: 'center',
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      borderRadius: tokens.radius.sm,
      backgroundColor: tokens.colors.surfaceContainerHighest,
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 9,
    },
    inputRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
    },
    iconGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing.xs,
    },
    iconOption: {
      width: 36,
      height: 36,
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
    addButtonDisabled: {
      backgroundColor: withAlpha(tokens.colors.textPrimary, 0.1),
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
    },
    addButtonText: {
      color: tokens.colors.onPrimary,
      fontWeight: '700',
      fontSize: tokens.type.body,
    },
  });
}
