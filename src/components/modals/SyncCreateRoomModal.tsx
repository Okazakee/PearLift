import * as Clipboard from 'expo-clipboard';
import { Copy, QrCode, Shield, X } from 'lucide-react-native';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AnimatedPressable } from '@/animation/primitives';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { IS_E2E } from '@/config/e2e';
import { E2E_IDS } from '@/config/testIds';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { SyncDataSummary } from '@/storage/types';
import { decodeSyncRoomInvite } from '@/sync/roomInvite';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import { Text } from '../AppText';

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
  const [keyExpanded, setKeyExpanded] = useState(IS_E2E);
  const inviteParts = useMemo(() => {
    if (!IS_E2E || !invitePayload) return null;
    try {
      return decodeSyncRoomInvite(invitePayload);
    } catch {
      return null;
    }
  }, [invitePayload]);

  useEffect(() => {
    if (!open) return;
    setKeyExpanded(IS_E2E);
  }, [open]);

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
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{t('sync.create.title')}</Text>
            <Text style={styles.subtitle}>{t('sync.create.subtitle')}</Text>
          </View>
          <Pressable
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={8}
            testID={E2E_IDS.syncCreate.close}
          >
            <X size={20} color={tokens.colors.textSecondary} />
          </Pressable>
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
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={tokens.colors.primary} />
              <Text style={styles.helperText}>
                {t('sync.create.inviteStarting')}
              </Text>
            </View>
          ) : (
            <Text style={styles.helperText}>
              {t('sync.create.invitePending')}
            </Text>
          )}
          {invitePayload ? (
            <>
              <Pressable
                onPress={() => setKeyExpanded(!keyExpanded)}
                testID={E2E_IDS.syncCreate.inviteText}
              >
                <Text style={styles.keyText}>
                  {keyExpanded
                    ? invitePayload
                    : `${invitePayload.slice(0, 24)}...${invitePayload.slice(-12)}`}
                </Text>
              </Pressable>
              <AnimatedPressable
                style={styles.outlineButton}
                onPress={() => void Clipboard.setStringAsync(invitePayload)}
                testID={E2E_IDS.syncCreate.copy}
              >
                <Copy size={15} color={tokens.colors.textPrimary} />
                <Text style={styles.outlineButtonText}>
                  {t('sync.create.copy')}
                </Text>
              </AnimatedPressable>
              {IS_E2E && inviteParts ? (
                <View style={styles.e2eKeysCard}>
                  <Text style={styles.e2eKeyLabel}>Pairing secret</Text>
                  <Text
                    selectable
                    style={styles.e2eKeyValue}
                    testID={E2E_IDS.syncCreate.pairingSecret}
                  >
                    {inviteParts.pairingSecretHex}
                  </Text>
                  <Text style={styles.e2eKeyLabel}>Bootstrap key</Text>
                  <Text
                    selectable
                    style={styles.e2eKeyValue}
                    testID={E2E_IDS.syncCreate.bootstrapKey}
                  >
                    {inviteParts.bootstrapKeyHex ?? ''}
                  </Text>
                </View>
              ) : null}
            </>
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
    header: { gap: 4, flexDirection: 'row', alignItems: 'flex-start' },
    headerLeft: { flex: 1 },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(tokens.colors.textSecondary, 0.1),
    },
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
    loadingWrap: {
      alignItems: 'center',
      gap: 12,
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
    e2eKeysCard: {
      marginTop: tokens.spacing.sm,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.primary, 0.25),
      backgroundColor: withAlpha(tokens.colors.primary, 0.08),
      padding: tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    e2eKeyLabel: {
      color: tokens.colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    e2eKeyValue: {
      color: tokens.colors.textPrimary,
      fontSize: 12,
      fontFamily: 'monospace',
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
