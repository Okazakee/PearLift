import {
  Download,
  type LucideIcon,
  QrCode,
  ScanLine,
  Share2,
  Upload,
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
      label: t('backup.localJson.export'),
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
      <Text style={styles.title}>
        {mode === 'qr'
          ? t('backup.deviceSync.title')
          : t('settings.localBackup.title')}
      </Text>
      <Text style={styles.message}>
        {mode === 'qr'
          ? t('deviceTransfer.shareDescription')
          : t('backup.localJson.description')}
      </Text>
      <View style={styles.actionsGrid}>
        {actions.map((action) => (
          <Pressable
            key={action.id}
            style={styles.actionButton}
            onPress={() => handleAction(action)}
          >
            <View style={styles.actionIcon}>
              {(() => {
                const Icon = action.icon;
                return <Icon size={22} color={tokens.colors.primary} />;
              })()}
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.cancelButton} onPress={onClose}>
        <Text style={styles.cancelText}>{t('common.cancel')}</Text>
      </Pressable>
    </AnimatedModalShell>
  );
}

function createStyles(
  tokens: ThemeTokens,
  layout: ReturnType<typeof useResponsiveLayout>,
) {
  return StyleSheet.create({
    modalRoot: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.34)',
    },
    sheet: {
      width: layout.isTablet ? 340 : 300,
      borderRadius: tokens.radius.xl,
      backgroundColor: tokens.colors.bgBase,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.md,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
      textAlign: 'center',
    },
    message: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      lineHeight: 18,
      textAlign: 'center',
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
      backgroundColor: tokens.colors.surfaceContainer,
      paddingHorizontal: tokens.spacing.md,
    },
    actionIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: withAlpha(tokens.colors.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionLabel: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
    cancelButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
  });
}
