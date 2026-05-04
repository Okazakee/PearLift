import { ArrowLeftRight, ArrowUpFromLine } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../../animation/primitives';
import type { SyncConflictSummary, SyncDataSummary } from '../../storage/types';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import { AnimatedScreenModal } from '../AnimatedScreenModal';

interface SyncFirstDecisionModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  localSummary: SyncDataSummary | null;
  remoteSummary: SyncDataSummary | null;
  conflictSummary: SyncConflictSummary | null;
  onChooseLocal: () => Promise<void>;
  onChooseRemote: () => Promise<void>;
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
  onChooseLocal,
  onChooseRemote,
  onClose,
}: SyncFirstDecisionModalProps) {
  const { t } = useTranslation();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
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
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('sync.decision.roomData')}</Text>
          <Text style={styles.helperText}>
            {t('sync.decision.datasetSummary', {
              workouts: remoteSummary?.workoutCount ?? 0,
              exercises: remoteSummary?.exerciseCount ?? 0,
            })}
          </Text>
        </View>

        {conflictSummary ? (
          <View style={styles.warningPanel}>
            <Text style={styles.warningTitle}>
              {t('sync.decision.conflictTitle')}
            </Text>
            <Text style={styles.helperText}>
              {t('sync.decision.conflictSummary', {
                workouts: conflictSummary.overlappingWorkoutIds.length,
                exercises: conflictSummary.overlappingExerciseIds.length,
              })}
            </Text>
          </View>
        ) : null}

        <AnimatedPressable
          style={styles.primaryButton}
          onPress={() => void onChooseLocal()}
        >
          <ArrowUpFromLine size={16} color={tokens.colors.onPrimary} />
          <Text style={styles.primaryButtonText}>
            {t('sync.decision.useThisDevice')}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.outlineButton}
          onPress={() => void onChooseRemote()}
        >
          <ArrowLeftRight size={16} color={tokens.colors.textPrimary} />
          <Text style={styles.outlineButtonText}>
            {t('sync.decision.useRoomData')}
          </Text>
        </AnimatedPressable>
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
      paddingTop: topInset + tokens.spacing.lg,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.xl,
      gap: tokens.spacing.md,
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
