import * as Clipboard from 'expo-clipboard';
import { Copy, QrCode, Shield } from 'lucide-react-native';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AnimatedPressable } from '../../animation/primitives';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import type { SyncDataSummary } from '../../storage/types';
import type { ThemeTokens } from '../../theme/tokens';
import { AnimatedScreenModal } from '../AnimatedScreenModal';

interface SyncCreateRoomModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  invitePayload: string | null;
  isStarting: boolean;
  localSummary: SyncDataSummary | null;
  onClose: () => void;
}

export function SyncCreateRoomModal({
  open,
  tokens,
  topInset,
  bottomInset,
  invitePayload,
  isStarting,
  localSummary,
  onClose,
}: SyncCreateRoomModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset, layout),
    [tokens, topInset, bottomInset, layout],
  );
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !invitePayload) {
      setQrSvg(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const svg = await QRCode.toString(invitePayload, {
        type: 'svg',
        margin: 1,
        color: { dark: '#111113', light: '#ffffff' },
      });
      if (!cancelled) setQrSvg(svg);
    })();
    return () => {
      cancelled = true;
    };
  }, [invitePayload, open]);

  return (
    <AnimatedScreenModal
      open={open}
      onClose={onClose}
      presentation={layout.isTablet ? 'tablet-sheet' : 'fullscreen'}
      maxWidth={layout.isLandscape ? 820 : 720}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('sync.create.title')}</Text>
          <Text style={styles.subtitle}>{t('sync.create.subtitle')}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Shield size={16} color={tokens.colors.primary} />
            <Text style={styles.sectionTitle}>{t('sync.create.room')}</Text>
          </View>
          <Text style={styles.helperText}>{t('sync.create.explainer')}</Text>
          {localSummary ? (
            <Text style={styles.helperText}>
              {t('sync.create.datasetSummary', {
                workouts: localSummary.workoutCount,
                exercises: localSummary.exerciseCount,
              })}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <QrCode size={16} color={tokens.colors.primary} />
            <Text style={styles.sectionTitle}>
              {t('sync.create.masterKey')}
            </Text>
          </View>
          {qrSvg ? (
            <View style={styles.qrWrap}>
              <SvgXml xml={qrSvg} width={180} height={180} />
            </View>
          ) : isStarting ? (
            <ActivityIndicator color={tokens.colors.primary} />
          ) : null}
          <Text style={invitePayload ? styles.keyText : styles.helperText}>
            {invitePayload ??
              t(
                isStarting
                  ? 'sync.create.inviteStarting'
                  : 'sync.create.invitePending',
              )}
          </Text>
          {invitePayload ? (
            <AnimatedPressable
              style={styles.outlineButton}
              onPress={() => void Clipboard.setStringAsync(invitePayload)}
            >
              <Copy size={15} color={tokens.colors.textPrimary} />
              <Text style={styles.outlineButtonText}>
                {t('sync.create.copy')}
              </Text>
            </AnimatedPressable>
          ) : null}
        </View>
      </View>
    </AnimatedScreenModal>
  );
}

function createStyles(
  tokens: ThemeTokens,
  topInset: number,
  bottomInset: number,
  layout: ReturnType<typeof useResponsiveLayout>,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.colors.bgBase,
      paddingTop: topInset + tokens.spacing.lg,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.xl,
      gap: tokens.spacing.md,
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.isTablet ? 760 : undefined,
    },
    header: { gap: 4 },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
    },
    subtitle: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    section: {
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    helperText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    qrWrap: {
      alignSelf: 'center',
      padding: tokens.spacing.sm,
      borderRadius: tokens.radius.md,
      backgroundColor: '#fff',
    },
    keyText: {
      color: tokens.colors.textPrimary,
      fontSize: 12,
      fontFamily: 'monospace',
    },
    outlineButton: {
      minHeight: 42,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.sm,
    },
    outlineButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    primaryButton: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 'auto',
    },
    primaryButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
  });
}
