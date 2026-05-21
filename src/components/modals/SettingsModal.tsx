import { ChevronLeft } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import { AnimatedModalShell } from '@/components/AnimatedModalShell';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { AppearanceSection } from '@/components/modals/settings/AppearanceSection';
import { AppInfoSection } from '@/components/modals/settings/AppInfoSection';
import { DataSection } from '@/components/modals/settings/DataSection';
import { DeveloperSection } from '@/components/modals/settings/DeveloperSection';
import { PoweredByFooter } from '@/components/modals/settings/PoweredByFooter';
import {
  createSettingsStyles,
  type SettingsStyles,
} from '@/components/modals/settings/SettingsModal.styles';
import { SyncSection } from '@/components/modals/settings/SyncSection';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { PairedDevice, SyncStateRow } from '@/storage/types';
import type { SyncHealth } from '@/sync/types';
import type { ThemeMode, ThemePreference, ThemeTokens } from '@/theme/tokens';
import type { WeightUnit } from '@/types';
import { Text } from '../AppText';

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
  syncState: SyncStateRow | null;
  syncHealth: SyncHealth;
  pairedDevices: PairedDevice[];
  localDeviceDisplayName: string;
  masterKey: string | null;
  onToggleSync: (nextEnabled: boolean) => Promise<void>;
  onOpenCreateRoom: () => void;
  onOpenJoinRoom: () => void;
  onShowSyncQR: () => void;
  onApplyMasterKey: (nextKey: string) => Promise<void>;
  onRenameLocalDevice: (displayName: string) => Promise<void>;
  onCopyMasterKey: () => Promise<void>;
  onForgetDevice: (deviceId: string) => Promise<void>;
  onLeaveRoom: () => Promise<void>;
  onOpenDebug: () => void;
  onOpenLocalBackup: () => void;
  onOpenQRBackup: () => void;
  onClose: () => void;
  onResetData: () => void;
  onOpenGithub: () => void;
  defaultSyncExpanded?: boolean;
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
  syncState,
  syncHealth,
  pairedDevices,
  localDeviceDisplayName,
  masterKey,
  onToggleSync,
  onOpenCreateRoom,
  onOpenJoinRoom,
  onShowSyncQR,
  onApplyMasterKey,
  onRenameLocalDevice,
  onCopyMasterKey,
  onForgetDevice,
  onLeaveRoom,
  onOpenDebug,
  onOpenLocalBackup,
  onOpenQRBackup,
  onClose,
  onResetData,
  onOpenGithub,
  defaultSyncExpanded = false,
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

        <DataSection
          tokens={tokens}
          styles={styles}
          onOpenLocalBackup={onOpenLocalBackup}
          onOpenQRBackup={onOpenQRBackup}
          onResetData={onResetData}
        />

        <SyncSection
          tokens={tokens}
          styles={styles}
          syncState={syncState}
          syncHealth={syncHealth}
          pairedDevices={pairedDevices}
          localDeviceDisplayName={localDeviceDisplayName}
          masterKey={masterKey}
          defaultExpanded={defaultSyncExpanded}
          onToggleSync={onToggleSync}
          onOpenCreateRoom={onOpenCreateRoom}
          onOpenJoinRoom={onOpenJoinRoom}
          onShowSyncQR={onShowSyncQR}
          onApplyMasterKey={onApplyMasterKey}
          onRenameLocalDevice={onRenameLocalDevice}
          onCopyMasterKey={onCopyMasterKey}
          onForgetDevice={onForgetDevice}
          onLeaveRoom={onLeaveRoom}
          onOpenDebug={onOpenDebug}
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
