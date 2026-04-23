import {
  Activity,
  AlertTriangle,
  RefreshCw,
  Settings,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SyncStatus } from '../sync/types';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';

interface HeaderProps {
  tokens: ThemeTokens;
  topInset: number;
  syncStatus: SyncStatus;
  syncPeers: number;
  onOpenSyncQuickStatus: () => void;
  onOpenSettings: () => void;
}

type HeaderSyncState = 'issue' | 'connected' | 'connecting' | 'off';

function getHeaderSyncState(
  syncStatus: SyncStatus,
  syncPeers: number,
): HeaderSyncState {
  if (syncStatus === 'error') return 'issue';
  if (syncStatus === 'synced' && syncPeers > 0) return 'connected';
  if (syncStatus === 'connecting') return 'connecting';
  return 'off';
}

export function Header({
  tokens,
  topInset,
  syncStatus,
  syncPeers,
  onOpenSyncQuickStatus,
  onOpenSettings,
}: HeaderProps) {
  const { t } = useTranslation();
  const styles = createStyles(tokens, topInset);
  const syncState = getHeaderSyncState(syncStatus, syncPeers);

  const syncVisual = useMemo(() => {
    if (syncState === 'issue') {
      return {
        label: t('sync.quick.button.issue'),
        icon: AlertTriangle,
        color: tokens.colors.accentDanger,
        backgroundColor: withAlpha(tokens.colors.accentDanger, 0.16),
      };
    }
    if (syncState === 'connected') {
      return {
        label: t('sync.quick.button.connected'),
        icon: Activity,
        color: tokens.colors.primary,
        backgroundColor: withAlpha(tokens.colors.primary, 0.14),
      };
    }
    if (syncState === 'connecting') {
      return {
        label: t('sync.quick.button.connecting'),
        icon: RefreshCw,
        color: tokens.colors.textSecondary,
        backgroundColor: withAlpha(tokens.colors.textSecondary, 0.12),
      };
    }
    return {
      label: t('sync.quick.button.off'),
      icon: RefreshCw,
      color: tokens.colors.textSecondary,
      backgroundColor: tokens.colors.bgSurface,
    };
  }, [syncState, t, tokens]);
  const SyncIcon = syncVisual.icon;

  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <View style={styles.logoBadge}>
          <Image
            source={require('../../assets/pearlift_transparent.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        <View>
          <Text style={styles.title}>PearLift</Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={onOpenSyncQuickStatus}
          style={[
            styles.syncButton,
            { backgroundColor: syncVisual.backgroundColor },
          ]}
        >
          <SyncIcon size={14} color={syncVisual.color} />
          <Text style={[styles.syncButtonText, { color: syncVisual.color }]}>
            {syncVisual.label}
          </Text>
        </Pressable>
        <Pressable onPress={onOpenSettings} style={styles.iconButton}>
          <Settings size={18} color={tokens.colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(tokens: ThemeTokens, topInset: number) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: topInset + tokens.spacing.sm,
      paddingBottom: tokens.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.borderSubtle,
      backgroundColor: tokens.colors.background,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    logoBadge: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: tokens.colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoImage: {
      width: 24,
      height: 24,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 22,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
    },
    syncButton: {
      minHeight: 36,
      borderRadius: tokens.radius.pill,
      paddingHorizontal: tokens.spacing.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.outline, 0.2),
    },
    syncButtonText: {
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: tokens.colors.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
