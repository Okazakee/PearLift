import * as Clipboard from 'expo-clipboard';
import {
  AlertTriangle,
  ChevronLeft,
  Code,
  CodeXml,
  Copy,
  Info,
  RefreshCw,
  Share2,
  Sliders,
  Sun,
  Trash2,
} from 'lucide-react-native';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AnimatedPressable } from '../../animation/primitives';
import type { PairedDevice } from '../../storage/types';
import { getLanguageNativeName } from '../../storage/workoutRepository';
import type { SyncStatus } from '../../sync/types';
import type {
  ThemeMode,
  ThemePreference,
  ThemeTokens,
} from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import type { WeightUnit } from '../../types';
import { AnimatedScreenModal } from '../AnimatedScreenModal';

interface SettingsModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  appName: string;
  appVersion: string;
  appBuild: string;
  buildType: string;
  themePreference: ThemePreference;
  systemThemeMode: ThemeMode | null;
  onThemePreferenceChange: (next: ThemePreference) => void;
  weightUnit: WeightUnit;
  onWeightUnitChange: (next: WeightUnit) => void;
  language: string;
  onLanguageChange: (next: string) => void;
  onLanguageListOpen: () => void;
  syncStatus: SyncStatus;
  syncPeers: number;
  lastSyncedAt: string | null;
  syncError: string | null;
  syncSecret: string | null;
  pairedDevices: PairedDevice[];
  onToggleSync: () => void;
  onOpenSyncSetup: () => void;
  onForgetDevice: (deviceId: string) => Promise<void>;
  onClose: () => void;
  onResetData: () => void;
  onOpenGithub: () => void;
}

export function SettingsModal({
  open,
  tokens,
  topInset,
  bottomInset,
  appName,
  appVersion,
  appBuild,
  buildType,
  themePreference,
  onThemePreferenceChange,
  weightUnit,
  onWeightUnitChange,
  language,
  onLanguageChange,
  onLanguageListOpen,
  syncStatus,
  syncPeers,
  lastSyncedAt,
  syncError,
  syncSecret,
  pairedDevices,
  onToggleSync,
  onOpenSyncSetup,
  onForgetDevice,
  onClose,
  onResetData,
  onOpenGithub,
}: SettingsModalProps) {
  const { t } = useTranslation();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );

  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [qrSize, setQrSize] = useState(0);

  const syncActive = syncStatus === 'connecting' || syncStatus === 'synced';

  useEffect(() => {
    if (!syncActive || !syncSecret) {
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
  }, [syncActive, syncSecret]);

  const handleCopyCode = async () => {
    if (!syncSecret) return;
    await Clipboard.setStringAsync(syncSecret);
  };

  const handleShareCode = async () => {
    if (!syncSecret) return;
    await Share.share({ message: syncSecret });
  };

  const handleForgetConfirm = (deviceId: string) => {
    Alert.alert(
      t('settings.syncBackup.forgetConfirmTitle'),
      t('settings.syncBackup.forgetConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.syncBackup.forgetDevice'),
          style: 'destructive',
          onPress: () => void onForgetDevice(deviceId),
        },
      ],
    );
  };

  const optionStyle = (value: ThemePreference) => {
    const selected = themePreference === value;
    if (!selected) return styles.segment;
    return [styles.segment, styles.segmentSelected];
  };

  const optionTextStyle = (value: ThemePreference) => {
    const selected = themePreference === value;
    if (!selected) return styles.segmentText;
    return [styles.segmentText, styles.segmentTextSelected];
  };

  const unitOptionStyle = (value: WeightUnit) => {
    const selected = weightUnit === value;
    if (!selected) return styles.segment;
    return [styles.segment, styles.segmentSelected];
  };

  const unitOptionTextStyle = (value: WeightUnit) => {
    const selected = weightUnit === value;
    if (!selected) return styles.segmentText;
    return [styles.segmentText, styles.segmentTextSelected];
  };

  const languageOptionStyle = (value: string) => {
    const selected =
      language === value || (value === 'manual' && language !== 'system');
    if (!selected) return styles.segment;
    return [styles.segment, styles.segmentSelected];
  };

  const languageOptionTextStyle = (value: string) => {
    const selected =
      language === value || (value === 'manual' && language !== 'system');
    if (!selected) return styles.segmentText;
    return [styles.segmentText, styles.segmentTextSelected];
  };

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={onClose}>
            <ChevronLeft size={22} color={tokens.colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.title}>{t('settings.title')}</Text>
          <View style={styles.backButtonPlaceholder} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Appearance */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Sun size={16} color={tokens.colors.primary} />
              <Text style={styles.sectionTitle}>
                {t('settings.appearance.title')}
              </Text>
            </View>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>
                  {t('settings.appearance.theme')}
                </Text>
                <Text style={styles.rowSubtitle}>
                  {t('settings.appearance.themeSubtitle')}
                </Text>
              </View>
              <View style={styles.segmented}>
                <AnimatedPressable
                  style={optionStyle('system')}
                  onPress={() => onThemePreferenceChange('system')}
                >
                  <Text style={optionTextStyle('system')}>
                    {t('settings.appearance.themeSystem')}
                  </Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={optionStyle('light')}
                  onPress={() => onThemePreferenceChange('light')}
                >
                  <Text style={optionTextStyle('light')}>
                    {t('settings.appearance.themeLight')}
                  </Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={optionStyle('dark')}
                  onPress={() => onThemePreferenceChange('dark')}
                >
                  <Text style={optionTextStyle('dark')}>
                    {t('settings.appearance.themeDark')}
                  </Text>
                </AnimatedPressable>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>
                  {t('settings.appearance.weightUnit')}
                </Text>
                <Text style={styles.rowSubtitle}>
                  {t('settings.appearance.weightUnitSubtitle')}
                </Text>
              </View>
              <View style={styles.segmented}>
                <AnimatedPressable
                  style={unitOptionStyle('kg')}
                  onPress={() => onWeightUnitChange('kg')}
                >
                  <Text style={unitOptionTextStyle('kg')}>kg</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={unitOptionStyle('lb')}
                  onPress={() => onWeightUnitChange('lb')}
                >
                  <Text style={unitOptionTextStyle('lb')}>lb</Text>
                </AnimatedPressable>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>
                  {t('settings.appearance.language')}
                </Text>
              </View>
              <View style={styles.segmented}>
                <AnimatedPressable
                  style={languageOptionStyle('system')}
                  onPress={() => onLanguageChange('system')}
                >
                  <Text style={languageOptionTextStyle('system')}>
                    {t('settings.appearance.system')}
                  </Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={languageOptionStyle(
                    language === 'system' ? 'manual' : language,
                  )}
                  onPress={onLanguageListOpen}
                >
                  <Text
                    style={languageOptionTextStyle(
                      language === 'system' ? 'manual' : language,
                    )}
                  >
                    {language === 'system'
                      ? t('settings.appearance.manual')
                      : getLanguageNativeName(language)}
                  </Text>
                </AnimatedPressable>
              </View>
            </View>
          </View>

          {/* Sync & Backup */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <RefreshCw size={16} color={tokens.colors.primary} />
              <Text style={styles.sectionTitle}>
                {t('settings.syncBackup.title')}
              </Text>
            </View>

            {!syncActive ? (
              <>
                {syncError ? (
                  <Text style={styles.syncErrorText}>{syncError}</Text>
                ) : null}
                <AnimatedPressable
                  style={styles.githubButton}
                  onPress={onOpenSyncSetup}
                >
                  <Sliders size={18} color={tokens.colors.onPrimary} />
                  <Text style={styles.githubButtonText}>
                    {t('settings.syncBackup.enableSync')}
                  </Text>
                </AnimatedPressable>
              </>
            ) : (
              <>
                {/* Status row */}
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

                {/* QR code */}
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

                {/* Truncated code display */}
                {syncSecret ? (
                  <View style={styles.codeBox}>
                    <Text style={styles.codeText}>
                      {syncSecret.slice(0, 8)}…{syncSecret.slice(-8)}
                    </Text>
                  </View>
                ) : null}

                {/* Copy / Share buttons */}
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

                {/* Paired devices */}
                <Text style={styles.subSectionLabel}>
                  {t('settings.syncBackup.pairedDevices')}
                </Text>
                {pairedDevices.length === 0 ? (
                  <Text style={styles.rowSubtitle}>
                    {t('settings.syncBackup.noDevices')}
                  </Text>
                ) : (
                  pairedDevices.map((device) => (
                    <View key={device.deviceId} style={styles.deviceRow}>
                      <View style={styles.deviceInfo}>
                        <Text style={styles.deviceIdText}>
                          {device.deviceId.slice(0, 8)}…
                          {device.deviceId.slice(-8)}
                        </Text>
                        <Text style={styles.deviceLastSeen}>
                          {t('settings.syncBackup.lastSeen')}{' '}
                          {new Date(device.lastSeen).toLocaleDateString()}
                        </Text>
                      </View>
                      <AnimatedPressable
                        style={styles.forgetButton}
                        onPress={() => handleForgetConfirm(device.deviceId)}
                      >
                        <Trash2 size={13} color={tokens.colors.accentDanger} />
                        <Text style={styles.forgetButtonText}>
                          {t('settings.syncBackup.forgetDevice')}
                        </Text>
                      </AnimatedPressable>
                    </View>
                  ))
                )}

                {/* Stop sync */}
                <AnimatedPressable
                  style={styles.stopSyncButton}
                  onPress={onToggleSync}
                >
                  <RefreshCw size={16} color={tokens.colors.accentDanger} />
                  <Text style={styles.stopSyncButtonText}>
                    {t('settings.syncBackup.stopSync')}
                  </Text>
                </AnimatedPressable>
              </>
            )}
          </View>

          {/* Data */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AlertTriangle size={16} color={tokens.colors.accentDanger} />
              <Text style={styles.sectionTitle}>
                {t('settings.data.title')}
              </Text>
            </View>
            <Text style={styles.rowSubtitle}>
              {t('settings.data.resetDescription')}
            </Text>
            <AnimatedPressable style={styles.resetButton} onPress={onResetData}>
              <RefreshCw size={18} color={tokens.colors.accentDanger} />
              <Text style={styles.resetButtonText}>
                {t('settings.data.resetButton')}
              </Text>
            </AnimatedPressable>
          </View>

          {/* Developer */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Code size={16} color={tokens.colors.primary} />
              <Text style={styles.sectionTitle}>
                {t('settings.developer.title')}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                {t('settings.developer.maintainer')}
              </Text>
              <Text style={styles.infoValue}>Okazakee</Text>
            </View>
            <View style={styles.developerButtons}>
              <AnimatedPressable
                style={styles.developerPrimaryButton}
                onPress={onOpenGithub}
              >
                <CodeXml size={18} color={tokens.colors.onPrimary} />
                <Text style={styles.githubButtonText}>
                  {t('settings.developer.openRepo')}
                </Text>
              </AnimatedPressable>
            </View>
          </View>

          {/* App Info */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Info size={16} color={tokens.colors.primary} />
              <Text style={styles.sectionTitle}>
                {t('settings.appInfo.title')}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('settings.appInfo.name')}</Text>
              <Text style={styles.infoValue}>{appName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                {t('settings.appInfo.version')}
              </Text>
              <Text style={styles.infoValue}>{appVersion}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                {t('settings.appInfo.build')}
              </Text>
              <Text style={styles.infoValue}>{appBuild}</Text>
            </View>
            <View style={styles.infoRowLast}>
              <Text style={styles.infoLabel}>
                {t('settings.appInfo.buildType')}
              </Text>
              <Text style={styles.infoValue}>{buildType}</Text>
            </View>
          </View>
        </ScrollView>
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
    },
    header: {
      paddingTop: topInset + tokens.spacing.sm,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.outlineVariant,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.bgSurface,
    },
    backButtonPlaceholder: {
      width: 36,
      height: 36,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
    },
    content: {
      padding: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.xxl,
      gap: tokens.spacing.md,
    },
    section: {
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm + 2,
    },
    sectionTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
    rowSubtitle: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      lineHeight: 16,
    },
    segmented: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: withAlpha(tokens.colors.primary, 0.06),
    },
    segment: {
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 68,
    },
    segmentSelected: {
      backgroundColor: withAlpha(tokens.colors.primary, 0.22),
    },
    segmentText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    segmentTextSelected: {
      color: tokens.colors.textPrimary,
    },
    languagePill: {
      borderRadius: tokens.radius.pill,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      backgroundColor: withAlpha(tokens.colors.primary, 0.15),
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.primary, 0.25),
    },
    languagePillText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.label,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    badge: {
      borderRadius: tokens.radius.pill,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs,
      backgroundColor: withAlpha(tokens.colors.primary, 0.15),
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.primary, 0.25),
    },
    badgeText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: tokens.spacing.xs,
      borderBottomWidth: 0.5,
      borderBottomColor:
        tokens.mode === 'dark'
          ? withAlpha('#d1d1d6', 0.28)
          : withAlpha(tokens.colors.outline, 0.18),
    },
    infoRowLast: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: tokens.spacing.xs,
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
    syncErrorText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      lineHeight: 16,
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
    subSectionLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
      marginTop: tokens.spacing.xs,
    },
    deviceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: tokens.spacing.xs,
      borderBottomWidth: 0.5,
      borderBottomColor:
        tokens.mode === 'dark'
          ? withAlpha('#d1d1d6', 0.18)
          : withAlpha(tokens.colors.outline, 0.12),
    },
    deviceInfo: {
      flex: 1,
      gap: 2,
    },
    deviceIdText: {
      color: tokens.colors.textPrimary,
      fontSize: 12,
      fontFamily: 'SpaceGrotesk_600SemiBold',
    },
    deviceLastSeen: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    forgetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs,
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.35),
      backgroundColor: withAlpha(tokens.colors.error, 0.08),
    },
    forgetButtonText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    stopSyncButton: {
      marginTop: tokens.spacing.xs,
      borderRadius: tokens.radius.md,
      backgroundColor: withAlpha(tokens.colors.error, 0.12),
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.35),
    },
    stopSyncButtonText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    githubButton: {
      marginTop: tokens.spacing.xs,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.md,
    },
    githubButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    developerButtons: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.xs,
      width: '100%',
    },
    developerPrimaryButton: {
      flex: 1,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.md,
    },
    disabledButton: {
      opacity: 0.55,
    },
    resetButton: {
      marginTop: tokens.spacing.xs,
      borderRadius: tokens.radius.md,
      backgroundColor: withAlpha(tokens.colors.error, 0.12),
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.35),
    },
    resetButtonText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
  });
}
