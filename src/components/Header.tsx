import { Settings } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SyncHealth } from '@/sync/types';
import type { ThemeTokens } from '@/theme/tokens';

interface HeaderProps {
  tokens: ThemeTokens;
  topInset: number;
  maxWidth?: number;
  syncHealth?: SyncHealth | null;
  onOpenSettings: () => void;
  onOpenSyncQuickInfo?: () => void;
}

export function Header({
  tokens,
  topInset,
  maxWidth,
  syncHealth,
  onOpenSettings,
  onOpenSyncQuickInfo,
}: HeaderProps) {
  const styles = createStyles(tokens, topInset, maxWidth);

  const statusTone =
    syncHealth?.status === 'synced'
      ? tokens.colors.primary
      : syncHealth?.status === 'connecting' ||
          syncHealth?.status === 'dht_ready' ||
          syncHealth?.status === 'peer_connected' ||
          syncHealth?.status === 'handshake_ok' ||
          syncHealth?.status === 'replicating'
        ? tokens.colors.accentWarning
        : syncHealth?.status === 'error'
          ? tokens.colors.accentDanger
          : syncHealth?.status === 'waiting'
            ? tokens.colors.textSecondary
            : tokens.colors.textSecondary;

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
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
          {syncHealth ? (
            <Pressable
              onPress={onOpenSyncQuickInfo ?? onOpenSettings}
              style={styles.syncDotButton}
            >
              <View style={[styles.syncDot, { backgroundColor: statusTone }]} />
            </Pressable>
          ) : null}
          <Pressable onPress={onOpenSettings} style={styles.iconButton}>
            <Settings size={18} color={tokens.colors.textSecondary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function createStyles(
  tokens: ThemeTokens,
  topInset: number,
  maxWidth?: number,
) {
  return StyleSheet.create({
    container: {
      paddingTop: topInset + tokens.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.borderSubtle,
      backgroundColor: tokens.colors.background,
    },
    inner: {
      width: '100%',
      maxWidth,
      alignSelf: 'center',
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.md,
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
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: tokens.colors.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    syncDotButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: tokens.colors.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    syncDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
  });
}
