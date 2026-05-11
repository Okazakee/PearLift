import { Activity, Users, Wifi, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AnimatedModalShell } from '@/components/AnimatedModalShell';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { SyncHealth } from '@/sync/types';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';

interface SyncQuickInfoModalProps {
  open: boolean;
  tokens: ThemeTokens;
  syncHealth: SyncHealth;
  onMore: () => void;
  onClose: () => void;
}

function getDhtStatus(
  t: ReturnType<typeof useTranslation>['t'],
  health: SyncHealth,
) {
  if (health.status === 'error') return t('sync.quick.dhtError');
  if (health.status === 'idle') return t('sync.quick.dhtInactive');
  if (health.status === 'waiting') return t('sync.quick.dhtWaiting');
  if (health.bootstrapped) return t('sync.quick.dhtReady');
  return t('sync.quick.dhtBootstrapping');
}

function getSyncStatusLabel(
  t: ReturnType<typeof useTranslation>['t'],
  health: SyncHealth,
) {
  return t(`sync.info.status.${health.status}`);
}

export function SyncQuickInfoModal({
  open,
  tokens,
  syncHealth,
  onMore,
  onClose,
}: SyncQuickInfoModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const styles = createStyles(tokens, layout);

  const dhtLabel = getDhtStatus(t, syncHealth);
  const statusLabel = getSyncStatusLabel(t, syncHealth);
  const peersLabel =
    syncHealth.peers > 0
      ? t('sync.quick.peersConnected', { count: syncHealth.peers })
      : t('sync.quick.peersNone');

  return (
    <AnimatedModalShell
      open={open}
      onClose={onClose}
      containerStyle={styles.modalRoot}
      backdropStyle={styles.backdrop}
      sheetStyle={styles.sheet}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t('sync.quick.title')}</Text>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <X size={18} color={tokens.colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.infoList}>
        <View style={styles.infoRow}>
          <View
            style={[
              styles.infoIcon,
              { backgroundColor: withAlpha(tokens.colors.primary, 0.1) },
            ]}
          >
            <Activity size={16} color={tokens.colors.primary} />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>{t('sync.quick.dht')}</Text>
            <Text style={styles.infoValue}>{dhtLabel}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View
            style={[
              styles.infoIcon,
              { backgroundColor: withAlpha(tokens.colors.primary, 0.1) },
            ]}
          >
            <Wifi size={16} color={tokens.colors.primary} />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>{t('sync.quick.status')}</Text>
            <Text style={styles.infoValue}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View
            style={[
              styles.infoIcon,
              { backgroundColor: withAlpha(tokens.colors.primary, 0.1) },
            ]}
          >
            <Users size={16} color={tokens.colors.primary} />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>{t('sync.quick.peers')}</Text>
            <Text style={styles.infoValue}>{peersLabel}</Text>
          </View>
        </View>
      </View>

      {syncHealth.lastError ? (
        <Text style={styles.errorText}>{syncHealth.lastError}</Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable style={styles.moreButton} onPress={onMore}>
          <Text style={styles.moreButtonText}>{t('sync.quick.more')}</Text>
        </Pressable>
        <Pressable style={styles.closeTextButton} onPress={onClose}>
          <Text style={styles.closeTextButtonText}>{t('common.close')}</Text>
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
    infoList: {
      gap: tokens.spacing.sm,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.md,
      minHeight: 44,
    },
    infoIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoText: {
      flex: 1,
      gap: 2,
    },
    infoLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    infoValue: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    errorText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      lineHeight: 18,
      textAlign: 'center',
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: tokens.spacing.sm,
      flexWrap: 'wrap',
    },
    moreButton: {
      minHeight: 40,
      minWidth: 96,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
    },
    moreButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    closeTextButton: {
      minHeight: 40,
      minWidth: 96,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
    },
    closeTextButtonText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
  });
}
