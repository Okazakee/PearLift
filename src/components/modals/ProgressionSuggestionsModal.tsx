import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { E2E_IDS } from '@/config/testIds';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import type { ProgressionSuggestion, WeightUnit } from '@/types';
import {
  formatExerciseSettingInputValue,
  parseExerciseSettingInputValue,
} from '@/utils/exerciseSettings';
import { formatWeight, formatWeightUnit, toDisplayWeight } from '@/utils/units';
import { Text, TextInput } from '../AppText';

interface ProgressionSuggestionsModalProps {
  open: boolean;
  tokens: ThemeTokens;
  suggestions: ProgressionSuggestion[];
  weightUnit: WeightUnit;
  onClose: () => void;
  onApply: (suggestionId: string, nextWeightKg: number) => void;
  onSkip: (suggestionId: string) => void;
}

export function ProgressionSuggestionsModal({
  open,
  tokens,
  suggestions,
  weightUnit,
  onClose,
  onApply,
  onSkip,
}: ProgressionSuggestionsModalProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [draftWeights, setDraftWeights] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraftWeights((current) => {
      const next = { ...current };
      for (const suggestion of suggestions) {
        if (next[suggestion.id] != null) {
          continue;
        }
        next[suggestion.id] = formatExerciseSettingInputValue(
          suggestion.suggestedWeightKg,
          weightUnit,
        );
      }
      return next;
    });
  }, [open, suggestions, weightUnit]);

  return (
    <AnimatedScreenModal
      open={open}
      onClose={onClose}
      presentation="tablet-sheet"
      maxWidth={720}
      style={styles.screen}
    >
      <View style={styles.container}>
        <Text style={styles.title}>{t('progressionSuggestions.title')}</Text>
        <Text style={styles.subtitle}>
          {t('progressionSuggestions.subtitle')}
        </Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
        >
          {suggestions.map((suggestion) => (
            <View key={suggestion.id} style={styles.card}>
              <Text style={styles.exerciseName}>{suggestion.exerciseName}</Text>
              <Text style={styles.ruleLabel}>{suggestion.ruleLabel}</Text>
              <Text style={styles.reasonText}>
                {t('progressionSuggestions.reason', {
                  reason: suggestion.reason,
                })}
              </Text>

              <View style={styles.weightRow}>
                <View style={styles.weightGroup}>
                  <Text style={styles.label}>
                    {t('progressionSuggestions.current')}
                  </Text>
                  <Text style={styles.weightValue}>
                    {formatWeight(
                      toDisplayWeight(suggestion.currentWeightKg, weightUnit),
                      weightUnit,
                    )}{' '}
                    {formatWeightUnit(weightUnit)}
                  </Text>
                </View>
                <View style={styles.weightGroup}>
                  <Text style={styles.label}>
                    {t('progressionSuggestions.next')}
                  </Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.input}
                      value={draftWeights[suggestion.id] ?? ''}
                      onChangeText={(value) =>
                        setDraftWeights((current) => ({
                          ...current,
                          [suggestion.id]: value,
                        }))
                      }
                      keyboardType="decimal-pad"
                      testID={E2E_IDS.progressionSuggestion.weightInput(
                        suggestion.id,
                      )}
                    />
                    <Text style={styles.unitText}>
                      {formatWeightUnit(weightUnit)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.actionsRow}>
                <AnimatedPressable
                  style={styles.skipButton}
                  onPress={() => onSkip(suggestion.id)}
                  testID={E2E_IDS.progressionSuggestion.skip(suggestion.id)}
                >
                  <Text style={styles.skipText}>
                    {t('progressionSuggestions.skip')}
                  </Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.applyButton}
                  onPress={() => {
                    const parsed = parseExerciseSettingInputValue(
                      draftWeights[suggestion.id] ?? '',
                      weightUnit,
                    );
                    if (parsed == null) {
                      return;
                    }
                    onApply(suggestion.id, parsed);
                  }}
                  testID={E2E_IDS.progressionSuggestion.apply(suggestion.id)}
                >
                  <Text style={styles.applyText}>
                    {t('progressionSuggestions.apply')}
                  </Text>
                </AnimatedPressable>
              </View>
            </View>
          ))}
        </ScrollView>
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
    scroll: {
      flex: 1,
    },
    content: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.lg,
    },
    card: {
      gap: tokens.spacing.sm,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
    },
    exerciseName: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    ruleLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    reasonText: {
      color: withAlpha(tokens.colors.textSecondary, 0.9),
      fontSize: tokens.type.label,
    },
    weightRow: {
      flexDirection: 'row',
      gap: tokens.spacing.md,
      flexWrap: 'wrap',
    },
    weightGroup: {
      flex: 1,
      minWidth: 120,
      gap: 4,
    },
    label: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    weightValue: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
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
    unitText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      justifyContent: 'flex-end',
    },
    skipButton: {
      minHeight: 40,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.bgSurface,
      paddingHorizontal: tokens.spacing.md,
    },
    skipText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
    applyButton: {
      minHeight: 40,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: tokens.radius.md,
      backgroundColor: withAlpha(tokens.colors.success, 0.14),
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.success, 0.32),
      paddingHorizontal: tokens.spacing.md,
    },
    applyText: {
      color: tokens.colors.success,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
  });
}
