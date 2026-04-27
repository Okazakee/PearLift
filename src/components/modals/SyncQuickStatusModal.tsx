import { AlertTriangle, RefreshCw, Users, X } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../../animation/primitives';
import type { SyncStatus } from '../../sync/types';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import { AnimatedModalShell } from '../AnimatedModalShell';

interface SyncQuickStatusModalProps {
  open: boolean;
  tokens: ThemeTokens;
  syncStatus: SyncStatus;
  syncPeers: number;
  lastSyncedAt: string | null;
  syncError: string | null;
  onOpenSyncSetup: () => void;
  onOpenPairNewDevice: () => void;
  onOpenPairedDevices: () => void;
  onOpenSyncHub: () => void;
  onStopSync: () => void;
  onClose: () => void;
}

type SyncQuickState = 'issue' | 'connected' | 'connecting' | 'off';

function getQuickState(
  syncStatus: SyncStatus,
  syncPeers: number,
): SyncQuickState {
  if (syncStatus === 'error') return 'issue';
  if (syncStatus === 'synced' && syncPeers > 0) return 'connected';
  if (syncStatus === 'connecting') return 'connecting';
  return 'off';
}

export function SyncQuickStatusModal({
  open,
  tokens,
  syncStatus,
  syncPeers,
  lastSyncedAt,
  syncError,
  onOpenSyncSetup,
  onOpenPairNewDevice,
  onOpenPairedDevices,
  onOpenSyncHub,
  onStopSync,
  onClose,
}: SyncQuickStatusModalProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const quickState = getQuickState(syncStatus, syncPeers);
  const syncActive = syncStatus === 'connecting' || syncStatus === 'synced';
  const statusColor =
    quickState === 'issue'
      ? tokens.colors.accentWarning
      : quickState === 'connected'
        ? tokens.colors.primary
        : tokens.colors.textSecondary;

  const closeAnd = (fn: () => void) => {
    onClose();
    fn();
  };

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
        <AnimatedPressable style={styles.closeButton} onPress={onClose}>
          <X size={18} color={tokens.colors.textSecondary} />
        </AnimatedPressable>
      </View>

      <View style={styles.panel}>
        <View style={styles.statusSummaryRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusValue, { color: statusColor }]}>
            {t(`sync.quick.summary.${quickState}`, { count: syncPeers })}
          </Text>
        </View>

        <Text style={styles.description}>
          {t(`sync.quick.description.${quickState}`)}
        </Text>

        <View style={styles.infoRow}>
          <Users size={14} color={tokens.colors.textSecondary} />
          <Text style={styles.infoText}>
            {t('settings.syncBackup.peers', { count: syncPeers })}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <RefreshCw size={14} color={tokens.colors.textSecondary} />
          <Text style={styles.infoText}>
            {lastSyncedAt
              ? t('sync.quick.lastSyncAt', {
                  at: new Date(lastSyncedAt).toLocaleString(),
                })
              : t('sync.quick.lastSyncNever')}
          </Text>
        </View>

        {syncError ? <Text style={styles.errorText}>{syncError}</Text> : null}
      </View>

      <View style={styles.actions}>
        {!syncActive ? (
          <AnimatedPressable
            style={styles.primaryButton}
            onPress={() => closeAnd(onOpenSyncSetup)}
          >
            <Text style={styles.primaryButtonText}>
              {t('sync.quick.actions.setup')}
            </Text>
          </AnimatedPressable>
        ) : (
          <>
            <View style={styles.actionRow}>
              <AnimatedPressable
                style={styles.primaryButton}
                onPress={() => closeAnd(onOpenPairNewDevice)}
              >
                <Text style={styles.primaryButtonText}>
                  {t('sync.quick.actions.pair')}
                </Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.outlineButton}
                onPress={() => closeAnd(onOpenPairedDevices)}
              >
                <Text style={styles.outlineButtonText}>
                  {t('sync.quick.actions.manage')}
                </Text>
              </AnimatedPressable>
            </View>

            <AnimatedPressable
              style={styles.outlineButton}
              onPress={() => closeAnd(onOpenSyncHub)}
            >
              <Text style={styles.outlineButtonText}>
                {quickState === 'issue'
                  ? t('sync.quick.actions.troubleshoot')
                  : t('sync.quick.actions.openHub')}
              </Text>
            </AnimatedPressable>

            <AnimatedPressable
              style={styles.stopButton}
              onPress={() => closeAnd(onStopSync)}
            >
              <AlertTriangle size={14} color={tokens.colors.accentDanger} />
              <Text style={styles.stopButtonText}>
                {t('sync.quick.actions.stop')}
              </Text>
            </AnimatedPressable>
          </>
        )}
      </View>
    </AnimatedModalShell>
  );
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    modalRoot: {
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingHorizontal: tokens.spacing.md,
      paddingBottom: tokens.spacing.md,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheet: {
      width: '100%',
      maxWidth: 520,
      borderTopLeftRadius: tokens.radius.xl,
      borderTopRightRadius: tokens.radius.xl,
      borderBottomLeftRadius: tokens.radius.md,
      borderBottomRightRadius: tokens.radius.md,
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
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    panel: {
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.sm,
    },
    statusSummaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    statusDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    statusValue: {
      fontSize: tokens.type.body,
      fontWeight: '800',
    },
    description: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      lineHeight: 18,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
    },
    infoText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    errorText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      lineHeight: 18,
    },
    actions: {
      gap: tokens.spacing.sm,
    },
    actionRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
    },
    primaryButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
    },
    primaryButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '800',
    },
    outlineButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.surfaceContainerHigh,
      paddingHorizontal: tokens.spacing.md,
    },
    outlineButtonText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    stopButton: {
      minHeight: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.35),
      backgroundColor: withAlpha(tokens.colors.error, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.md,
    },
    stopButtonText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
  });
}
