import { Settings } from 'lucide-react-native';
import { useEffect, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
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
  const styles = createStyles(tokens, topInset);
  const syncState = getHeaderSyncState(syncStatus, syncPeers);

  const syncVisual = useMemo(() => {
    if (syncState === 'issue') {
      return {
        accessibilityLabel: 'Sync warning',
        color: tokens.colors.accentWarning,
        ringColor: withAlpha(tokens.colors.accentWarning, 0.22),
        pulsing: true,
      };
    }
    if (syncState === 'connected') {
      return {
        accessibilityLabel: 'Sync connected',
        color: tokens.colors.primary,
        ringColor: withAlpha(tokens.colors.primary, 0.18),
        pulsing: false,
      };
    }
    if (syncState === 'connecting') {
      return {
        accessibilityLabel: 'Sync connecting',
        color: tokens.colors.accentWarning,
        ringColor: withAlpha(tokens.colors.accentWarning, 0.2),
        pulsing: true,
      };
    }
    return {
      accessibilityLabel: 'Sync off',
      color: tokens.colors.textSecondary,
      ringColor: withAlpha(tokens.colors.textSecondary, 0.12),
      pulsing: false,
    };
  }, [syncState, tokens]);

  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!syncVisual.pulsing) {
      pulse.value = withTiming(1, { duration: 160 });
      return;
    }

    pulse.value = withRepeat(
      withSequence(
        withTiming(0.35, {
          duration: 780,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(1, {
          duration: 780,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      false,
    );
  }, [pulse, syncVisual.pulsing]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.86 + pulse.value * 0.18 }],
  }));

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
          style={styles.syncIndicatorButton}
          accessibilityRole="button"
          accessibilityLabel={syncVisual.accessibilityLabel}
        >
          <Animated.View
            style={[
              styles.syncIndicatorRing,
              { backgroundColor: syncVisual.ringColor },
              syncVisual.pulsing && pulseStyle,
            ]}
          />
          <View
            style={[
              styles.syncIndicatorDot,
              { backgroundColor: syncVisual.color },
            ]}
          />
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
    syncIndicatorButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.outline, 0.2),
      backgroundColor: tokens.colors.bgSurface,
    },
    syncIndicatorRing: {
      width: 18,
      height: 18,
      borderRadius: 9,
      position: 'absolute',
    },
    syncIndicatorDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
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
