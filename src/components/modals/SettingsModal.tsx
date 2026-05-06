import {
  AlertTriangle,
  ChevronLeft,
  Code,
  CodeXml,
  Download,
  Info,
  RefreshCw,
  ScanLine,
  Share2,
  Shield,
  Sun,
  Upload,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AnimatedPressable } from '../../animation/primitives';
import { useCachedSvg } from '../../hooks/useCachedSvg';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { getLanguageNativeName } from '../../storage/workoutRepository';
import type {
  ThemeMode,
  ThemePreference,
  ThemeTokens,
} from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import type { WeightUnit } from '../../types';
import { AnimatedModalShell } from '../AnimatedModalShell';
import { AnimatedScreenModal } from '../AnimatedScreenModal';

const HOLEPUNCH_LOGO_WIDTH = 88;
const HOLEPUNCH_LOGO_HEIGHT = 36;
const PEAR_LOGO_WIDTH = 120;
const PEAR_LOGO_HEIGHT = 29;
const PEAR_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 20 155 37" fill="none">
  <path d="M32.7692 20H34.7337V23.6537H32.7692V20Z" fill="#B0D944"/>
  <path d="M31.787 24.81V25.55H29.8225V26.475H37.6804V25.55H35.716V24.1162H33.7515V24.81H31.787Z" fill="#B0D944"/>
  <path d="M39.6449 26.9375H33.7515V27.6312H27.858V29.2962H39.6449V26.9375Z" fill="#B0D944"/>
  <path d="M41.6094 29.7587H33.7515V30.4525H25.8935V32.1175H41.6094V29.7587Z" fill="#B0D944"/>
  <path d="M41.6094 32.58H33.7515V33.2738H25.8935V34.9388H41.6094V32.58Z" fill="#B0D944"/>
  <path d="M43.5739 35.4013H33.7515V36.095H23.929V37.76H43.5739V35.4013Z" fill="#B0D944"/>
  <path d="M43.5739 38.2225H33.7515V38.9163H23.929V40.5813H43.5739V38.2225Z" fill="#B0D944"/>
  <path d="M45.5384 41.0438H33.7515V41.7375H21.9645V43.4025H45.5384V41.0438Z" fill="#B0D944"/>
  <path d="M47.5029 43.865H33.7515V44.5588H20V46.2238H47.5029V43.865Z" fill="#B0D944"/>
  <path d="M47.5029 46.6863H33.7515V47.38H20V49.045H47.5029V46.6863Z" fill="#B0D944"/>
  <path d="M47.5029 49.5075H33.7515V50.2013H20V51.8663H47.5029V49.5075Z" fill="#B0D944"/>
  <path d="M43.5739 52.3288H33.7515V53.0225H23.929V54.6875H43.5739V52.3288Z" fill="#B0D944"/>
  <path d="M39.6449 55.15H33.7515V55.8438H27.858V57H39.6449V55.15Z" fill="#B0D944"/>
  <path d="M77.6395 35.8714H81.1177V46.336H77.6395V49.8242H67.2047V56.8007H60.2483V32.3832H77.6395V35.8714ZM74.1612 46.336V35.8714H67.2047V46.336H74.1612Z" fill="#B0D944"/>
  <path d="M101.974 32.3832V35.8714H105.452V42.8478H91.5389V46.336H105.452V49.8242H88.0606V46.336H84.5824V35.8714H88.0606V32.3832H101.974ZM98.4953 35.8714H91.5389V39.3595H98.4953V35.8714Z" fill="#B0D944"/>
  <path d="M115.873 46.336H122.829V35.8714H115.873V46.336ZM112.395 46.336H108.916V35.8714H112.395V32.3832H129.786V49.8242H112.395V46.336Z" fill="#B0D944"/>
  <path d="M150.641 32.3832V35.8714H147.163V39.3595H143.685V42.8478H140.207V49.8242H133.251V32.3832H140.207V35.8714H143.685V32.3832H150.641Z" fill="#B0D944"/>
  <path d="M175 49.8242H154.13V46.336H168.043V42.8478H154.13V32.3832H175V35.8714H161.087V39.3595H175V49.8242Z" fill="#B0D944"/>
</svg>
`;

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
  syncEnabled: boolean;
  syncPeers: number;
  syncLastSyncedAt: string | null;
  onOpenSync: () => void;
  onShareToDevice: () => void;
  onScanFromDevice: () => void;
  onExportLocalBackup: () => void;
  onImportLocalBackup: () => void;
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
  syncEnabled,
  syncPeers,
  syncLastSyncedAt,
  onOpenSync,
  onShareToDevice,
  onScanFromDevice,
  onExportLocalBackup,
  onImportLocalBackup,
  onClose,
  onResetData,
  onOpenGithub,
}: SettingsModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();

  const { svgContent: holepunchSvg } = useCachedSvg(
    'https://holepunch.to/images/holepunch-logo-short.svg',
    'holepunch-logo.svg',
  );

  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset, layout),
    [tokens, topInset, bottomInset, layout],
  );

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

  const content = (
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

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Shield size={16} color={tokens.colors.primary} />
            <Text style={styles.sectionTitle}>
              {t('settings.syncBackup.title')}
            </Text>
          </View>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>
                {syncEnabled
                  ? t('settings.syncStatus.enabled')
                  : t('settings.syncStatus.disabled')}
              </Text>
              <Text style={styles.rowSubtitle}>
                {syncEnabled
                  ? t('settings.syncStatus.syncingWith', {
                      count: Math.max(syncPeers, 0),
                    })
                  : t('settings.syncStatus.off')}
              </Text>
              <Text style={styles.rowSubtitle}>
                {syncLastSyncedAt
                  ? t('settings.syncStatus.lastSuccessfulSync', {
                      at: new Date(syncLastSyncedAt).toLocaleString(),
                    })
                  : t('sync.quick.lastSyncNever')}
              </Text>
            </View>
          </View>
          <AnimatedPressable style={styles.outlineButton} onPress={onOpenSync}>
            <Shield size={15} color={tokens.colors.textSecondary} />
            <Text style={styles.outlineButtonText}>
              {t('settings.syncBackup.openSyncSetup')}
            </Text>
          </AnimatedPressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Download size={16} color={tokens.colors.primary} />
            <Text style={styles.sectionTitle}>
              {t('settings.localBackup.title')}
            </Text>
          </View>
          <Text style={styles.rowSubtitle}>
            {t('backup.localJson.description')}
          </Text>
          <View style={styles.backupGrid}>
            <AnimatedPressable
              style={[styles.outlineButton, styles.backupButton]}
              onPress={onExportLocalBackup}
            >
              <Download size={15} color={tokens.colors.textSecondary} />
              <Text style={styles.outlineButtonText}>
                {t('settings.localBackup.export')}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.outlineButton, styles.backupButton]}
              onPress={onImportLocalBackup}
            >
              <Upload size={15} color={tokens.colors.textSecondary} />
              <Text style={styles.outlineButtonText}>
                {t('settings.localBackup.import')}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.outlineButton, styles.backupButton]}
              onPress={onShareToDevice}
            >
              <Share2 size={15} color={tokens.colors.textSecondary} />
              <Text style={styles.outlineButtonText}>
                {t('settings.localBackup.shareToDevice')}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.outlineButton, styles.backupButton]}
              onPress={onScanFromDevice}
            >
              <ScanLine size={15} color={tokens.colors.textSecondary} />
              <Text style={styles.outlineButtonText}>
                {t('settings.localBackup.scanFromDevice')}
              </Text>
            </AnimatedPressable>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AlertTriangle size={16} color={tokens.colors.accentDanger} />
            <Text style={styles.sectionTitle}>{t('settings.data.title')}</Text>
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

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Code size={16} color={tokens.colors.primary} />
            <Text style={styles.sectionTitle}>
              {t('settings.developer.title')}
            </Text>
          </View>
          <View style={styles.infoRowLast}>
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
            <Text style={styles.infoLabel}>{t('settings.appInfo.build')}</Text>
            <Text style={styles.infoValue}>{appBuild}</Text>
          </View>
          <View style={styles.infoRowLast}>
            <Text style={styles.infoLabel}>
              {t('settings.appInfo.buildType')}
            </Text>
            <Text style={styles.infoValue}>{buildType}</Text>
          </View>
        </View>

        <View style={styles.poweredByFooter}>
          <Text style={styles.poweredByText}>Powered by</Text>
          <View style={styles.poweredByLogos}>
            <Pressable
              style={styles.poweredByLogoPressable}
              onPress={() => Linking.openURL('https://holepunch.to')}
            >
              {holepunchSvg ? (
                <SvgXml
                  xml={holepunchSvg}
                  width={HOLEPUNCH_LOGO_WIDTH}
                  height={HOLEPUNCH_LOGO_HEIGHT}
                />
              ) : (
                <Text style={styles.poweredByText}>Holepunch</Text>
              )}
            </Pressable>
            <Text style={styles.poweredByAmpersand}>+</Text>
            <Pressable
              style={styles.poweredByLogoPressable}
              onPress={() => Linking.openURL('https://pears.com')}
            >
              <SvgXml
                xml={PEAR_LOGO_SVG}
                width={PEAR_LOGO_WIDTH}
                height={PEAR_LOGO_HEIGHT}
              />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );

  if (layout.isTablet) {
    return (
      <AnimatedModalShell
        open={open}
        onClose={onClose}
        slideFrom="right"
        containerStyle={styles.tabletPanelModalRoot}
        backdropStyle={styles.tabletPanelBackdrop}
        sheetStyle={styles.tabletPanelSheet}
      >
        {content}
      </AnimatedModalShell>
    );
  }

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
      {content}
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
    },
    tabletPanelModalRoot: {
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
    },
    tabletPanelBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.34)',
    },
    tabletPanelSheet: {
      width: layout.isLandscape ? 520 : 440,
      height: '100%',
      overflow: 'hidden',
      borderTopLeftRadius: tokens.radius.xl,
      borderBottomLeftRadius: tokens.radius.xl,
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
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.isLandscape ? 920 : undefined,
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
      flexShrink: 1,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: tokens.spacing.sm,
      flexWrap: layout.isLandscape ? 'wrap' : 'nowrap',
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
      lineHeight: 18,
    },
    segmented: {
      flexDirection: 'row',
      borderRadius: tokens.radius.pill,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      overflow: 'hidden',
      flexShrink: 0,
      backgroundColor: tokens.colors.surfaceContainerHigh,
    },
    segment: {
      paddingHorizontal: tokens.spacing.md,
      minHeight: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentSelected: {
      backgroundColor: withAlpha(tokens.colors.primary, 0.16),
      borderColor: 'transparent',
    },
    segmentText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    segmentTextSelected: {
      color: tokens.colors.primary,
    },
    actionRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      flexWrap: 'wrap',
      marginTop: tokens.spacing.xs,
    },
    outlineButton: {
      minHeight: 44,
      flex: layout.isLandscape ? 1 : 0,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      gap: tokens.spacing.sm,
    },
    outlineButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
    fullWidthButton: {
      width: '100%',
      minWidth: layout.isLandscape ? 220 : undefined,
    },
    backupGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.xs,
    },
    backupButton: {
      width: '48%',
      minHeight: 66,
    },
    resetButton: {
      marginTop: tokens.spacing.sm,
      minHeight: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.32),
      backgroundColor: withAlpha(tokens.colors.accentDanger, 0.08),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      gap: tokens.spacing.sm,
    },
    resetButtonText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
    developerButtons: {
      flexDirection: 'row',
      marginTop: tokens.spacing.xs,
    },
    developerPrimaryButton: {
      minHeight: 44,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      flex: 1,
    },
    githubButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: tokens.spacing.md,
    },
    infoRowLast: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.xs,
    },
    infoLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    infoValue: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
      flexShrink: 1,
      textAlign: 'right',
    },
    poweredByFooter: {
      alignItems: 'center',
      paddingVertical: tokens.spacing.lg,
      gap: tokens.spacing.sm,
    },
    poweredByText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    poweredByLogos: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.sm,
    },
    poweredByLogoPressable: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    poweredByAmpersand: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
  });
}
