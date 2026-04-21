import * as Clipboard from 'expo-clipboard';
import { Copy, Share2, X } from 'lucide-react-native';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AnimatedPressable } from '../../animation/primitives';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import { AnimatedModalShell } from '../AnimatedModalShell';

interface SyncPairNewDeviceModalProps {
  open: boolean;
  tokens: ThemeTokens;
  syncPeers: number;
  lastSyncedAt: string | null;
  syncSecret: string | null;
  onClose: () => void;
}

export function SyncPairNewDeviceModal({
  open,
  tokens,
  syncPeers,
  lastSyncedAt,
  syncSecret,
  onClose,
}: SyncPairNewDeviceModalProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [qrSize, setQrSize] = useState(0);

  useEffect(() => {
    if (!open || !syncSecret) {
      setQrSvg(null);
      return;
    }
    let cancelled = false;
    void QRCode.toString(syncSecret, {
      type: 'svg',
      margin: 1,
      color: { dark: '#111113', light: '#ffffff' },
    })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setQrSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, syncSecret]);

  const handleCopyCode = async () => {
    if (!syncSecret) return;
    await Clipboard.setStringAsync(syncSecret);
  };

  const handleShareCode = async () => {
    if (!syncSecret) return;
    await Share.share({ message: syncSecret });
  };

  const truncated = syncSecret
    ? `${syncSecret.slice(0, 8)}…${syncSecret.slice(-8)}`
    : null;

  return (
    <AnimatedModalShell
      open={open}
      onClose={onClose}
      containerStyle={styles.modalRoot}
      backdropStyle={styles.backdrop}
      sheetStyle={styles.card}
    >
      <View style={styles.header}>
        <Text style={styles.title}>
          {t('settings.syncBackup.pairNewDevice')}
        </Text>
        <AnimatedPressable style={styles.closeButton} onPress={onClose}>
          <X size={18} color={tokens.colors.textSecondary} />
        </AnimatedPressable>
      </View>

      <View style={styles.panel}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>
            {t('settings.syncBackup.peers', { count: syncPeers })}
          </Text>
          {lastSyncedAt ? (
            <Text style={styles.infoValue}>
              {new Date(lastSyncedAt).toLocaleString()}
            </Text>
          ) : null}
        </View>

        <View
          style={styles.qrBox}
          onLayout={(e) => {
            const next = Math.floor(e.nativeEvent.layout.width);
            if (Number.isFinite(next) && next > 0 && next !== qrSize) {
              setQrSize(next);
            }
          }}
        >
          {qrSize > 0 && qrSvg ? (
            <SvgXml xml={qrSvg} width={qrSize} height={qrSize} />
          ) : null}
        </View>

        {truncated ? (
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{truncated}</Text>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <AnimatedPressable
            style={styles.outlineButton}
            onPress={() => void handleCopyCode()}
          >
            <Copy size={15} color={tokens.colors.textSecondary} />
            <Text style={styles.outlineButtonText}>
              {t('settings.syncBackup.copyCode')}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.outlineButton}
            onPress={() => void handleShareCode()}
          >
            <Share2 size={15} color={tokens.colors.textSecondary} />
            <Text style={styles.outlineButtonText}>
              {t('settings.syncBackup.shareCode')}
            </Text>
          </AnimatedPressable>
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
      backgroundColor: tokens.colors.surfaceContainer,
    },
    panel: {
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.sm,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: tokens.spacing.xs,
      borderBottomWidth: 0.5,
      borderBottomColor: withAlpha(tokens.colors.outline, 0.18),
    },
    infoLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '500',
    },
    infoValue: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontFamily: 'SpaceGrotesk_600SemiBold',
    },
    qrBox: {
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: '#ffffff',
      width: '70%',
      alignItems: 'center',
      justifyContent: 'center',
      aspectRatio: 1,
      overflow: 'hidden',
      alignSelf: 'center',
    },
    codeBox: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      padding: tokens.spacing.sm,
      alignItems: 'center',
    },
    codeText: {
      color: tokens.colors.textPrimary,
      fontSize: 13,
      fontFamily: 'SpaceGrotesk_600SemiBold',
    },
    actionRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
    },
    outlineButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
      minHeight: 40,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
    },
    outlineButtonText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
  });
}
