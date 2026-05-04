import * as Clipboard from 'expo-clipboard';
import { Copy, QrCode, Shield } from 'lucide-react-native';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AnimatedPressable } from '../../animation/primitives';
import type { SyncDataSummary } from '../../storage/types';
import type { ThemeTokens } from '../../theme/tokens';
import { AnimatedScreenModal } from '../AnimatedScreenModal';

interface SyncCreateRoomModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  masterKey: string | null;
  localSummary: SyncDataSummary | null;
  onStartRoom: () => Promise<void>;
  onClose: () => void;
}

export function SyncCreateRoomModal({
  open,
  tokens,
  topInset,
  bottomInset,
  masterKey,
  localSummary,
  onStartRoom,
  onClose,
}: SyncCreateRoomModalProps) {
  const { t } = useTranslation();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !masterKey) return;
    let cancelled = false;
    void (async () => {
      const svg = await QRCode.toString(masterKey, {
        type: 'svg',
        margin: 1,
        color: { dark: '#111113', light: '#ffffff' },
      });
      if (!cancelled) setQrSvg(svg);
    })();
    return () => {
      cancelled = true;
    };
  }, [masterKey, open]);

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
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
          ) : null}
          <Text style={styles.keyText}>{masterKey ?? '—'}</Text>
          <AnimatedPressable
            style={styles.outlineButton}
            onPress={() => void Clipboard.setStringAsync(masterKey ?? '')}
          >
            <Copy size={15} color={tokens.colors.textPrimary} />
            <Text style={styles.outlineButtonText}>
              {t('sync.create.copy')}
            </Text>
          </AnimatedPressable>
        </View>

        <AnimatedPressable
          style={styles.primaryButton}
          onPress={() => {
            setBusy(true);
            void onStartRoom().finally(() => setBusy(false));
          }}
        >
          {busy ? (
            <ActivityIndicator color={tokens.colors.onPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {t('sync.create.startRoom')}
            </Text>
          )}
        </AnimatedPressable>
      </View>
    </AnimatedScreenModal>
  );
}

function createStyles(
  tokens: ThemeTokens,
  topInset: number,
  bottomInset: number,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.colors.bgBase,
      paddingTop: topInset + tokens.spacing.lg,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.xl,
      gap: tokens.spacing.md,
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
