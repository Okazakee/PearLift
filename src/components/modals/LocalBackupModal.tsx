import { Download, Upload, X } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import { AnimatedModalShell } from '../AnimatedModalShell';

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
        <Text style={styles.title}>{t('backup.title')}</Text>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <X size={18} color={tokens.colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('backup.localJson.title')}</Text>
        <Text style={styles.message}>{t('backup.localJson.description')}</Text>
        <View style={styles.actions}>
          <Pressable style={styles.actionButton} onPress={onExport}>
            <Download size={18} color={tokens.colors.onPrimary} />
            <Text style={styles.actionText}>
              {t('backup.localJson.export')}
            </Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={onImport}>
            <Upload size={18} color={tokens.colors.onPrimary} />
            <Text style={styles.actionText}>
              {t('backup.localJson.import')}
            </Text>
          </Pressable>
        </View>
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
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    card: {
      width: '100%',
      maxWidth: layout.isTablet ? Math.min(layout.modalMaxWidth, 620) : 520,
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
      flexDirection: layout.isTablet ? 'row' : 'column',
      gap: tokens.spacing.sm,
      flexWrap: 'wrap',
    },
    actionButton: {
      flex: layout.isTablet ? 1 : 0,
      minWidth: layout.isTablet ? 180 : 0,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      minHeight: 44,
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
    },
    actionText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
  });
}
