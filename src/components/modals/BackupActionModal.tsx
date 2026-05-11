import {
  Download,
  type LucideIcon,
  QrCode,
  ScanLine,
  Share2,
  Upload,
  X,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AnimatedModalShell } from '@/components/AnimatedModalShell';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';

interface BackupAction {
  id: string;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}

interface BackupActionModalProps {
  open: boolean;
  mode: 'local' | 'qr' | null;
  tokens: ThemeTokens;
  onExportLocalBackup: () => void;
  onImportLocalBackup: () => void;
  onShareBackup: () => void;
  onShareToDevice: () => void;
  onScanFromDevice: () => void;
  onClose: () => void;
}

export function BackupActionModal({
  open,
  mode,
  tokens,
  onExportLocalBackup,
  onImportLocalBackup,
  onShareBackup,
  onShareToDevice,
  onScanFromDevice,
  onClose,
}: BackupActionModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(tokens, layout), [tokens, layout]);

  const localActions: BackupAction[] = [
    {
      id: 'save',
      icon: Download,
      label: t('settings.localBackup.export'),
      onPress: onExportLocalBackup,
    },
    {
      id: 'restore',
      icon: Upload,
      label: t('settings.localBackup.import'),
      onPress: onImportLocalBackup,
    },
    {
      id: 'share',
      icon: Share2,
      label: t('settings.localBackup.shareBackup'),
      onPress: onShareBackup,
    },
  ];

  const qrActions: BackupAction[] = [
    {
      id: 'shareQr',
      icon: QrCode,
      label: t('settings.localBackup.shareToDevice'),
      onPress: onShareToDevice,
    },
    {
      id: 'scanQr',
      icon: ScanLine,
      label: t('settings.localBackup.scanFromDevice'),
      onPress: onScanFromDevice,
    },
  ];

  const actions = mode === 'qr' ? qrActions : localActions;

  const handleAction = (action: BackupAction) => {
    onClose();
    action.onPress();
  };

  if (!mode) return null;

  return (
    <AnimatedModalShell
      open={open}
      onClose={onClose}
      containerStyle={styles.modalRoot}
      backdropStyle={styles.backdrop}
      sheetStyle={styles.sheet}
    >
      <View style={styles.header}>
        <Text style={styles.title}>
          {mode === 'qr'
            ? t('backup.deviceSync.title')
            : t('settings.localBackup.title')}
        </Text>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <X size={18} color={tokens.colors.textSecondary} />
        </Pressable>
      </View>
      <Text style={styles.message}>
        {mode === 'qr'
          ? t('deviceTransfer.shareDescription')
          : t('backup.localJson.description')}
      </Text>
      <View style={styles.actionsGrid}>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Pressable
              key={action.id}
              style={styles.actionButton}
              onPress={() => handleAction(action)}
            >
              <View style={styles.actionIcon}>
                <Icon size={20} color={tokens.colors.primary} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          );
        })}
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
      backgroundColor: 'rgba(0, 0, 0, 0.58)',
    },
    sheet: {
      width: '100%',
      maxWidth: layout.isTablet ? Math.min(layout.modalMaxWidth, 520) : 420,
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
    message: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      lineHeight: 20,
    },
    actionsGrid: {
      gap: tokens.spacing.sm,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.md,
      minHeight: 52,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      paddingHorizontal: tokens.spacing.md,
    },
    actionIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: withAlpha(tokens.colors.primary, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionLabel: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
  });
}
