import { Download, Sliders, Upload, X } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';
import { AnimatedModalShell } from './AnimatedModalShell';

interface LocalBackupModalProps {
  open: boolean;
  tokens: ThemeTokens;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
}

export function LocalBackupModal({
  open,
  tokens,
  onClose,
  onExport,
  onImport,
}: LocalBackupModalProps) {
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
        <Text style={styles.title}>Backup & Sync</Text>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <X size={18} color={tokens.colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device Sync</Text>
        <Text style={styles.message}>
          Device-to-device sync is coming soon.
        </Text>
        <Pressable
          style={[styles.secondaryButton, styles.disabledButton]}
          disabled
        >
          <Sliders size={18} color={tokens.colors.primary} />
          <Text style={styles.secondaryText}>Enable in Sync Setup</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Local JSON</Text>
        <Text style={styles.message}>
          Export your workout data to a JSON file or import a previous local
          backup.
        </Text>
        <View style={styles.actions}>
          <Pressable style={styles.actionButton} onPress={onExport}>
            <Download size={18} color={tokens.colors.onPrimary} />
            <Text style={styles.actionText}>Export Backup</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={onImport}>
            <Upload size={18} color={tokens.colors.onPrimary} />
            <Text style={styles.actionText}>Import Backup</Text>
          </Pressable>
        </View>
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
      maxWidth: 520,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.md,
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
    section: {
      gap: tokens.spacing.sm,
      padding: tokens.spacing.md,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: withAlpha(tokens.colors.primary, 0.04),
    },
    sectionTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    message: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      lineHeight: 20,
    },
    actions: {
      gap: tokens.spacing.sm,
    },
    actionButton: {
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      minHeight: 44,
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
    },
    secondaryButton: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.primary, 0.35),
      backgroundColor: withAlpha(tokens.colors.primary, 0.08),
      minHeight: 44,
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
    },
    disabledButton: {
      opacity: 0.55,
    },
    actionText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    secondaryText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
  });
}
