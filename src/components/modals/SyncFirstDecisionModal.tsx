import { ArrowLeftRight, ArrowUpFromLine } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { SyncConflictSummary, SyncDataSummary } from '@/storage/types';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';

interface SyncFirstDecisionModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  localSummary: SyncDataSummary | null;
  remoteSummary: SyncDataSummary | null;
  conflictSummary: SyncConflictSummary | null;
  workoutNameMap: Record<string, string>;
  exerciseNameMap: Record<string, string>;
  onChooseLocal: () => Promise<void>;
  onChooseRemote: () => Promise<void>;
  onChooseMerge?: () => Promise<void>;
  onClose: () => void;
}

export function SyncFirstDecisionModal({
  open,
  tokens,
  topInset,
  bottomInset,
  localSummary,
  remoteSummary,
  conflictSummary,
  workoutNameMap,
  exerciseNameMap,
  onChooseLocal,
  onChooseRemote,
  onChooseMerge,
  onClose,
}: SyncFirstDecisionModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset, layout),
    [tokens, topInset, bottomInset, layout],
  );
  const [busyChoice, setBusyChoice] = useState<
    'local' | 'remote' | 'merge' | null
  >(null);

  const canMerge =
    onChooseMerge != null &&
    conflictSummary != null &&
    conflictSummary.overlappingWorkoutIds.length === 0 &&
    conflictSummary.overlappingExerciseIds.length === 0 &&
    conflictSummary.overlappingWeekConfigIds.length === 0 &&
    conflictSummary.overlappingDayConfigIds.length === 0 &&
    conflictSummary.remoteOpCount <= 24;

  const runChoice = async (
    choice: 'local' | 'remote' | 'merge',
    action: () => Promise<void>,
  ) => {
    if (busyChoice) return;
    setBusyChoice(choice);
    try {
      await action();
    } finally {
      setBusyChoice(null);
    }
  };

  return (
    <AnimatedScreenModal
      open={open}
      onClose={onClose}
      presentation={layout.isTablet ? 'tablet-sheet' : 'fullscreen'}
      maxWidth={layout.isLandscape ? 880 : 760}
    >
      <View style={styles.container}>
        <Text style={styles.title}>{t('sync.decision.title')}</Text>
        <Text style={styles.subtitle}>{t('sync.decision.subtitle')}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('sync.decision.thisDevice')}
          </Text>
          <Text style={styles.helperText}>
            {t('sync.decision.datasetSummary', {
              workouts: localSummary?.workoutCount ?? 0,
              exercises: localSummary?.exerciseCount ?? 0,
            })}
          </Text>
          <Text style={styles.helperText}>
            {t('sync.decision.useThisDeviceHint')}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('sync.decision.roomData')}</Text>
          <Text style={styles.helperText}>
            {t('sync.decision.datasetSummary', {
              workouts: remoteSummary?.workoutCount ?? 0,
              exercises: remoteSummary?.exerciseCount ?? 0,
            })}
          </Text>
          <Text style={styles.helperText}>
            {t('sync.decision.useRoomDataHint')}
          </Text>
        </View>

        {conflictSummary ? (
          <View style={styles.warningPanel}>
            <Text style={styles.warningTitle}>
              {t('sync.decision.conflictTitle')}
            </Text>
            {conflictSummary.overlappingWorkoutIds.length > 0 ? (
              <>
                <Text
                  style={[
                    styles.helperText,
                    { fontWeight: '700', marginTop: 4 },
                  ]}
                >
                  {t('sync.decision.conflictWorkouts')}:
                </Text>
                {conflictSummary.overlappingWorkoutIds.map((id) => (
                  <Text key={id} style={styles.conflictItem}>
                    {'\u2022'} {workoutNameMap[id] ?? id}
                  </Text>
                ))}
              </>
            ) : null}
            {conflictSummary.overlappingExerciseIds.length > 0 ? (
              <>
                <Text
                  style={[
                    styles.helperText,
                    { fontWeight: '700', marginTop: 4 },
                  ]}
                >
                  {t('sync.decision.conflictExercises')}:
                </Text>
                {conflictSummary.overlappingExerciseIds.map((id) => (
                  <Text key={id} style={styles.conflictItem}>
                    {'\u2022'} {exerciseNameMap[id] ?? id}
                  </Text>
                ))}
              </>
            ) : null}
            <Text style={styles.helperText}>
              {t('sync.decision.conflictSummary', {
                workouts: conflictSummary.overlappingWorkoutIds.length,
                exercises: conflictSummary.overlappingExerciseIds.length,
              })}
            </Text>
            <Text style={styles.helperText}>
              {t('sync.decision.configConflictSummary', {
                weeks: conflictSummary.overlappingWeekConfigIds.length,
                days: conflictSummary.overlappingDayConfigIds.length,
                backlog: conflictSummary.remoteOpCount,
              })}
            </Text>
            {!canMerge && onChooseMerge != null ? (
              <Text
                style={[
                  styles.helperText,
                  {
                    color: tokens.colors.accentWarning,
                    fontWeight: '600',
                    marginTop: 4,
                  },
                ]}
              >
                {t('sync.decision.mergeUnavailableHint')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {canMerge && onChooseMerge != null ? (
          <AnimatedPressable
            style={styles.mergeButton}
            onPress={() => void runChoice('merge', onChooseMerge)}
          >
            {busyChoice === 'merge' ? (
              <ActivityIndicator color={tokens.colors.onPrimary} />
            ) : (
              <>
                <ArrowLeftRight size={16} color={tokens.colors.onPrimary} />
                <Text style={styles.mergeButtonText}>
                  {t('sync.decision.useMerge')}
                </Text>
              </>
            )}
          </AnimatedPressable>
        ) : null}

        <AnimatedPressable
          style={styles.primaryButton}
          onPress={() => void runChoice('local', onChooseLocal)}
        >
          {busyChoice === 'local' ? (
            <ActivityIndicator color={tokens.colors.onPrimary} />
          ) : (
            <>
              <ArrowUpFromLine size={16} color={tokens.colors.onPrimary} />
              <Text style={styles.primaryButtonText}>
                {t('sync.decision.useThisDevice')}
              </Text>
            </>
          )}
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.outlineButton}
          onPress={() => void runChoice('remote', onChooseRemote)}
        >
          {busyChoice === 'remote' ? (
            <ActivityIndicator color={tokens.colors.textPrimary} />
          ) : (
            <>
              <ArrowLeftRight size={16} color={tokens.colors.textPrimary} />
              <Text style={styles.outlineButtonText}>
                {t('sync.decision.useRoomData')}
              </Text>
            </>
          )}
        </AnimatedPressable>
      </View>
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
      paddingTop: topInset + tokens.spacing.lg,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.xl,
      gap: tokens.spacing.md,
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.isTablet ? 820 : undefined,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
    },
    subtitle: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    section: {
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
      gap: tokens.spacing.xs,
    },
    sectionTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    helperText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    conflictItem: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      paddingLeft: tokens.spacing.sm,
    },
    warningPanel: {
      borderRadius: tokens.radius.md,
      padding: tokens.spacing.md,
      backgroundColor: withAlpha(tokens.colors.accentWarning, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentWarning, 0.28),
    },
    warningTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '800',
      marginBottom: 4,
    },
    mergeButton: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.primary, 0.2),
    },
    mergeButtonText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
    primaryButton: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      marginTop: 'auto',
    },
    primaryButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
    outlineButton: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: tokens.spacing.sm,
    },
    outlineButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
  });
}
