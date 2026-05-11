import { ChevronLeft } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import { AnimatedModalShell } from '@/components/AnimatedModalShell';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { AppearanceSection } from '@/components/modals/settings/AppearanceSection';
import { AppInfoSection } from '@/components/modals/settings/AppInfoSection';
import { DataResetSection } from '@/components/modals/settings/DataResetSection';
import { DeveloperSection } from '@/components/modals/settings/DeveloperSection';
import { LocalBackupSection } from '@/components/modals/settings/LocalBackupSection';
import { PoweredByFooter } from '@/components/modals/settings/PoweredByFooter';
import {
  createSettingsStyles,
  type SettingsStyles,
} from '@/components/modals/settings/SettingsModal.styles';
import { SyncBackupSection } from '@/components/modals/settings/SyncBackupSection';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { ThemeMode, ThemePreference, ThemeTokens } from '@/theme/tokens';
import type { WeightUnit } from '@/types';

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

  const styles: SettingsStyles = useMemo(
    () => createSettingsStyles(tokens, topInset, bottomInset, layout),
    [tokens, topInset, bottomInset, layout],
  );

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
        <AppearanceSection
          tokens={tokens}
          styles={styles}
          themePreference={themePreference}
          onThemePreferenceChange={onThemePreferenceChange}
          weightUnit={weightUnit}
          onWeightUnitChange={onWeightUnitChange}
          language={language}
          onLanguageChange={onLanguageChange}
          onLanguageListOpen={onLanguageListOpen}
        />

        <SyncBackupSection
          tokens={tokens}
          styles={styles}
          syncEnabled={syncEnabled}
          syncLastSyncedAt={syncLastSyncedAt}
          onOpenSync={onOpenSync}
        />

        <LocalBackupSection
          tokens={tokens}
          styles={styles}
          onExportLocalBackup={onExportLocalBackup}
          onImportLocalBackup={onImportLocalBackup}
          onShareToDevice={onShareToDevice}
          onScanFromDevice={onScanFromDevice}
        />

        <DataResetSection
          tokens={tokens}
          styles={styles}
          onResetData={onResetData}
        />

        <DeveloperSection
          tokens={tokens}
          styles={styles}
          onOpenGithub={onOpenGithub}
        />

        <AppInfoSection
          tokens={tokens}
          styles={styles}
          appName={appName}
          appVersion={appVersion}
          appBuild={appBuild}
          buildType={buildType}
        />

        <PoweredByFooter styles={styles} />
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
