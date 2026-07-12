import { Eye, X } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ChangeSummary } from '@/backup/types';
import { AnimatedModalShell } from '@/components/AnimatedModalShell';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import { Text } from '../AppText';

interface ImportPreviewModalProps {
  open: boolean;
  tokens: ThemeTokens;
  summary: ChangeSummary;
  onClose: () => void;
  onImportAsNewProgram: () => void;
  onReplaceActiveProgram: () => void;
}

export function ImportPreviewModal({
  open,
  tokens,
  summary,
  onClose,
  onImportAsNewProgram,
  onReplaceActiveProgram,
}: ImportPreviewModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(tokens, layout), [tokens, layout]);

  return (
    <AnimatedModalShell
      open={open}
      onClose={onClose}
      containerStyle={styles.modalRoot}
      backdropStyle={styles.backdrop}
      sheetStyle={styles.card}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Eye size={18} color={tokens.colors.primary} />
          <Text style={styles.title}>
            {t('importPreview.titleWithProgram', {
              program: summary.programName,
            })}
          </Text>
        </View>
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
          <X size={18} color={tokens.colors.textSecondary} />
        </Pressable>
      </View>

      <Text style={styles.summaryText}>
        {summary.totalChanges > 0
          ? t('importPreview.changesDetected', { count: summary.totalChanges })
          : t('importPreview.noChanges')}
      </Text>
      <Text style={styles.summaryHint}>{t('importPreview.modeHint')}</Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{summary.incomingWorkoutCount}</Text>
            <Text style={styles.statLabel}>
              {t('importPreview.stats.workouts')}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {summary.incomingExerciseCount}
            </Text>
            <Text style={styles.statLabel}>
              {t('importPreview.stats.exercises')}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {summary.preservedWeights.length}
            </Text>
            <Text style={styles.statLabel}>
              {t('importPreview.stats.preservedWeights')}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {summary.missingWeightExercises.length}
            </Text>
            <Text style={styles.statLabel}>
              {t('importPreview.stats.needsWeight')}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('importPreview.sections.exerciseStatus')}
          </Text>
          <View style={styles.row}>
            <Text style={styles.rowName}>
              {t('importPreview.exerciseStatus.matching')}
            </Text>
            <Text style={styles.rowMeta}>
              {summary.matchingExercises.length}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowName}>
              {t('importPreview.exerciseStatus.changed')}
            </Text>
            <Text style={styles.rowMeta}>
              {summary.changedExercises.length}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowName}>
              {t('importPreview.exerciseStatus.new')}
            </Text>
            <Text style={styles.rowMeta}>{summary.newExercises.length}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowName}>
              {t('importPreview.exerciseStatus.removed')}
            </Text>
            <Text style={styles.rowMeta}>
              {summary.removedExercises.length}
            </Text>
          </View>
        </View>

        {summary.preservedWeights.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('importPreview.sections.preservedWeights')}
            </Text>
            {summary.preservedWeights.map((item) => (
              <View
                key={`${item.workoutId}:${item.exerciseId}`}
                style={styles.exerciseRow}
              >
                <View style={styles.exerciseCopy}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowSubtle}>{item.workoutName}</Text>
                </View>
                <Text style={styles.rowMeta}>
                  {t('importPreview.currentWeightKept')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {summary.missingWeightExercises.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('importPreview.sections.missingWeights')}
            </Text>
            {summary.missingWeightExercises.map((item) => (
              <View
                key={`${item.workoutId}:${item.exerciseId}`}
                style={styles.exerciseRow}
              >
                <View style={styles.exerciseCopy}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowSubtle}>{item.workoutName}</Text>
                </View>
                <Text style={styles.rowMeta}>
                  {t('importPreview.noPreviousWeight')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {summary.removedExercises.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('importPreview.sections.removedExercises')}
            </Text>
            {summary.removedExercises.map((item) => (
              <View
                key={`${item.workoutId}:${item.exerciseId}`}
                style={styles.exerciseRow}
              >
                <View style={styles.exerciseCopy}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowSubtle}>{item.workoutName}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {summary.workouts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('importPreview.sections.workouts')}
            </Text>
            {summary.workouts.map((item) => (
              <View key={item.workoutId} style={styles.row}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  +{item.added} / -{item.removed} / ~{item.modified}
                </Text>
              </View>
            ))}
          </View>
        )}

        {summary.settings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('importPreview.sections.settings')}
            </Text>
            {summary.settings.map((item) => (
              <View key={item.key} style={styles.row}>
                <Text style={styles.rowName}>{item.key}</Text>
                <Text style={styles.rowMeta}>
                  {item.from} {'->'} {item.to}
                </Text>
              </View>
            ))}
          </View>
        )}

        {summary.programMetadata.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('importPreview.sections.program')}
            </Text>
            {summary.programMetadata.map((item) => (
              <View key={item.key} style={styles.row}>
                <Text style={styles.rowName}>{item.key}</Text>
                <Text style={styles.rowMeta}>
                  {item.from} {'->'} {item.to}
                </Text>
              </View>
            ))}
          </View>
        )}

        {summary.weekConfigs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('importPreview.sections.weeks')}
            </Text>
            {summary.weekConfigs.map((item) => (
              <View key={item.key} style={styles.row}>
                <Text style={styles.rowName}>{item.key}</Text>
                <Text style={styles.rowMeta}>
                  {item.from} {'->'} {item.to}
                </Text>
              </View>
            ))}
          </View>
        )}

        {summary.dayConfigs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('importPreview.sections.days')}
            </Text>
            {summary.dayConfigs.map((item) => (
              <View key={item.key} style={styles.row}>
                <Text style={styles.rowName}>{item.key}</Text>
                <Text style={styles.rowMeta}>
                  {item.from} {'->'} {item.to}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable style={styles.cancelButton} onPress={onClose}>
          <Text style={styles.cancelText}>{t('importPreview.cancel')}</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryActionButton}
          onPress={onReplaceActiveProgram}
        >
          <Text style={styles.secondaryActionText}>
            {t('importPreview.replaceActiveProgram')}
          </Text>
        </Pressable>
        <Pressable style={styles.confirmButton} onPress={onImportAsNewProgram}>
          <Text style={styles.confirmText}>
            {t('importPreview.importAsNewProgram')}
          </Text>
        </Pressable>
      </View>
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
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    card: {
      width: '100%',
      maxWidth: layout.isTablet ? Math.min(layout.modalMaxWidth, 680) : 580,
      maxHeight: '82%',
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
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
    summaryText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
    },
    summaryHint: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    scroll: {
      maxHeight: 360,
    },
    content: {
      gap: tokens.spacing.sm,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing.sm,
    },
    statCard: {
      minWidth: '47%',
      flex: 1,
      padding: tokens.spacing.sm,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: withAlpha(tokens.colors.primary, 0.06),
      gap: tokens.spacing.xs,
    },
    statValue: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.title,
      fontWeight: '700',
    },
    statLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    section: {
      gap: tokens.spacing.xs,
      padding: tokens.spacing.sm,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: withAlpha(tokens.colors.primary, 0.04),
    },
    sectionTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.sm,
    },
    exerciseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.sm,
    },
    exerciseCopy: {
      flex: 1,
      gap: 2,
    },
    rowName: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '500',
      flex: 1,
    },
    rowSubtle: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    rowMeta: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: tokens.spacing.sm,
      flexWrap: 'wrap',
    },
    cancelButton: {
      minWidth: 96,
      minHeight: 40,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
    },
    cancelText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
    secondaryActionButton: {
      minWidth: 150,
      minHeight: 40,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: withAlpha(tokens.colors.accentDanger, 0.08),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
    },
    secondaryActionText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    confirmButton: {
      minWidth: 170,
      minHeight: 40,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
    },
    confirmText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
  });
}
