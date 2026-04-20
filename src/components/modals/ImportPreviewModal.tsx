import { Eye, X } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ChangeSummary } from '../../backup/types';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import { AnimatedModalShell } from '../AnimatedModalShell';

interface ImportPreviewModalProps {
  open: boolean;
  tokens: ThemeTokens;
  summary: ChangeSummary;
  onClose: () => void;
  onConfirm: () => void;
}

export function ImportPreviewModal({
  open,
  tokens,
  summary,
  onClose,
  onConfirm,
}: ImportPreviewModalProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);

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
          <Text style={styles.title}>Import Preview</Text>
        </View>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <X size={18} color={tokens.colors.textSecondary} />
        </Pressable>
      </View>

      <Text style={styles.summaryText}>
        {summary.totalChanges > 0
          ? `${summary.totalChanges} change(s) detected.`
          : 'No changes detected. Backup is identical to current data.'}
      </Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {summary.workouts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Workouts</Text>
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
            <Text style={styles.sectionTitle}>Settings</Text>
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

        {summary.weekConfigs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Weeks</Text>
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
            <Text style={styles.sectionTitle}>Days</Text>
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
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable style={styles.confirmButton} onPress={onConfirm}>
          <Text style={styles.confirmText}>Import Backup</Text>
        </Pressable>
      </View>
    </AnimatedModalShell>
  );
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    modalRoot: {
      paddingHorizontal: tokens.spacing.lg,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    card: {
      width: '100%',
      maxWidth: 580,
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
    scroll: {
      maxHeight: 360,
    },
    content: {
      gap: tokens.spacing.sm,
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
    rowName: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '500',
      flex: 1,
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
    confirmButton: {
      minWidth: 128,
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
