import {
  AlertTriangle,
  ChevronLeft,
  Code,
  CodeXml,
  Download,
  Info,
  RefreshCw,
  Sun,
  Upload,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../../animation/primitives';
import { getLanguageNativeName } from '../../storage/workoutRepository';
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
  onExportLocalBackup,
  onImportLocalBackup,
  onClose,
  onResetData,
  onOpenGithub,
}: SettingsModalProps) {
  const { t } = useTranslation();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
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
              <Download size={16} color={tokens.colors.primary} />
              <Text style={styles.sectionTitle}>
                {t('settings.localBackup.title')}
              </Text>
            </View>
            <Text style={styles.rowSubtitle}>
              {t('backup.localJson.description')}
            </Text>
            <View style={styles.actionRow}>
              <AnimatedPressable
                style={styles.outlineButton}
                onPress={onExportLocalBackup}
              >
                <Download size={15} color={tokens.colors.textSecondary} />
                <Text style={styles.outlineButtonText}>
                  {t('settings.localBackup.export')}
                </Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.outlineButton}
                onPress={onImportLocalBackup}
              >
                <Upload size={15} color={tokens.colors.textSecondary} />
                <Text style={styles.outlineButtonText}>
                  {t('settings.localBackup.import')}
                </Text>
              </AnimatedPressable>
            </View>
          </View>

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
      flexShrink: 1,
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
  });
}
