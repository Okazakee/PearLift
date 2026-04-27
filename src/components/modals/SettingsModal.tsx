import * as Clipboard from 'expo-clipboard';
import {
  AlertTriangle,
  ChevronLeft,
  Code,
  CodeXml,
  Copy,
  Download,
  Info,
  RefreshCw,
  ScrollText,
  Sliders,
  Sun,
  Upload,
  Users,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../../animation/primitives';
import type { PairedDevice } from '../../storage/types';
import { getLanguageNativeName } from '../../storage/workoutRepository';
import type { SyncLogEntry } from '../../sync/logger';
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
  syncConnections: number;
  syncPeerKeys: string[];
  syncLocalWriterKey: string | null;
  syncAutobaseKey: string | null;
  syncTopicHex: string | null;
  syncBootstrapped: boolean;
  syncReconnectAttempts: number;
  localDeviceId: string | null;
  syncLogs: SyncLogEntry[];
  onRefreshSyncLogs: () => void;
  lastSyncedAt: string | null;
  syncError: string | null;
  pairedDevices: PairedDevice[];
  onToggleSync: () => void;
  onOpenSyncQuickStatus: () => void;
  onOpenSyncSetup: () => void;
  onOpenPairNewDevice: () => void;
  onOpenPairedDevices: () => void;
  syncHubOpen: boolean;
  onSyncHubOpenChange: (open: boolean) => void;
  onExportLocalBackup: () => void;
  onImportLocalBackup: () => void;
  onClose: () => void;
  onResetData: () => void;
  onOpenGithub: () => void;
}

function truncate(value: string | null | undefined, head = 10, tail = 8) {
  if (!value) return null;
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatTime(ts: number) {
  try {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch {
    return '--:--:--';
  }
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
  syncConnections,
  syncPeerKeys,
  syncLocalWriterKey,
  syncAutobaseKey,
  syncTopicHex,
  syncBootstrapped,
  syncReconnectAttempts,
  localDeviceId,
  syncLogs,
  onRefreshSyncLogs,
  lastSyncedAt,
  syncError,
  pairedDevices,
  onToggleSync,
  onOpenSyncQuickStatus,
  onOpenSyncSetup,
  onOpenPairNewDevice,
  onOpenPairedDevices,
  syncHubOpen,
  onSyncHubOpenChange,
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const syncActive = syncStatus === 'connecting' || syncStatus === 'synced';

  useEffect(() => {
    if (!open || !syncHubOpen) return;
    onRefreshSyncLogs();
    const interval = setInterval(onRefreshSyncLogs, 5000);
    return () => clearInterval(interval);
  }, [open, syncHubOpen, onRefreshSyncLogs]);

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

  const handleModalClose = () => {
    if (syncHubOpen) {
      onSyncHubOpenChange(false);
      return;
    }
    onClose();
  };

  const copyField = async (key: string, value: string | null) => {
    if (!value) return;
    try {
      await Clipboard.setStringAsync(value);
      setCopiedKey(key);
      setTimeout(
        () => setCopiedKey((curr) => (curr === key ? null : curr)),
        1200,
      );
    } catch {
      // ignore
    }
  };

  const handleGoBack = () => {
    if (syncHubOpen) {
      onSyncHubOpenChange(false);
      return;
    }
    onClose();
  };

  return (
    <AnimatedScreenModal open={open} onClose={handleModalClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={handleGoBack}>
            <ChevronLeft size={22} color={tokens.colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.title}>
            {syncHubOpen ? t('settings.syncHub.title') : t('settings.title')}
          </Text>
          <View style={styles.backButtonPlaceholder} />
        </View>

        {syncHubOpen ? (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Info size={16} color={tokens.colors.primary} />
                <Text style={styles.sectionTitle}>
                  {t('settings.syncHub.overview')}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  {t('sync.info.statusLabel')}
                </Text>
                <Text style={styles.infoValue}>
                  {t(`sync.info.status.${syncStatus}`)}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('sync.info.peers')}</Text>
                <Text style={styles.infoValue}>{syncPeers}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  {t('settings.syncHub.connections')}
                </Text>
                <Text style={styles.infoValue}>{syncConnections}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  {t('sync.info.bootstrapped')}
                </Text>
                <Text style={styles.infoValue}>
                  {syncBootstrapped
                    ? t('sync.info.bootstrappedYes')
                    : t('sync.info.bootstrappedNo')}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  {t('sync.info.reconnectAttempts')}
                </Text>
                <Text style={styles.infoValue}>{syncReconnectAttempts}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('sync.info.lastSync')}</Text>
                <Text style={styles.infoValue}>
                  {lastSyncedAt
                    ? new Date(lastSyncedAt).toLocaleString()
                    : t('sync.info.never')}
                </Text>
              </View>
              {syncError ? (
                <Text style={styles.syncErrorText}>{syncError}</Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Sliders size={16} color={tokens.colors.primary} />
                <Text style={styles.sectionTitle}>
                  {t('settings.syncHub.ids')}
                </Text>
              </View>
              <CopyRow
                styles={styles}
                tokens={tokens}
                label={t('sync.info.deviceId')}
                value={localDeviceId}
                display={truncate(localDeviceId)}
                copied={copiedKey === 'deviceId'}
                onCopy={() => void copyField('deviceId', localDeviceId)}
                copiedLabel={t('sync.info.copied')}
                copyLabel={t('sync.info.copy')}
              />
              <CopyRow
                styles={styles}
                tokens={tokens}
                label={t('settings.syncHub.localWriterKey')}
                value={syncLocalWriterKey}
                display={truncate(syncLocalWriterKey)}
                copied={copiedKey === 'writer'}
                onCopy={() => void copyField('writer', syncLocalWriterKey)}
                copiedLabel={t('sync.info.copied')}
                copyLabel={t('sync.info.copy')}
              />
              <CopyRow
                styles={styles}
                tokens={tokens}
                label={t('sync.info.autobaseKey')}
                value={syncAutobaseKey}
                display={truncate(syncAutobaseKey)}
                copied={copiedKey === 'autobase'}
                onCopy={() => void copyField('autobase', syncAutobaseKey)}
                copiedLabel={t('sync.info.copied')}
                copyLabel={t('sync.info.copy')}
              />
              <CopyRow
                styles={styles}
                tokens={tokens}
                label={t('sync.info.topic')}
                value={syncTopicHex}
                display={truncate(syncTopicHex)}
                copied={copiedKey === 'topic'}
                onCopy={() => void copyField('topic', syncTopicHex)}
                copiedLabel={t('sync.info.copied')}
                copyLabel={t('sync.info.copy')}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Users size={16} color={tokens.colors.primary} />
                <Text style={styles.sectionTitle}>
                  {t('sync.info.connectedPeers')} ({syncPeerKeys.length})
                </Text>
              </View>
              {syncPeerKeys.length === 0 ? (
                <Text style={styles.rowSubtitle}>{t('sync.info.noPeers')}</Text>
              ) : (
                syncPeerKeys.map((key) => (
                  <CopyRow
                    key={key}
                    styles={styles}
                    tokens={tokens}
                    label={null}
                    value={key}
                    display={truncate(key)}
                    copied={copiedKey === `peer-${key}`}
                    onCopy={() => void copyField(`peer-${key}`, key)}
                    copiedLabel={t('sync.info.copied')}
                    copyLabel={t('sync.info.copy')}
                  />
                ))
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <RefreshCw size={16} color={tokens.colors.primary} />
                <Text style={styles.sectionTitle}>
                  {t('settings.syncHub.management')}
                </Text>
              </View>

              {!syncActive ? (
                <AnimatedPressable
                  style={styles.githubButton}
                  onPress={onOpenSyncSetup}
                >
                  <Sliders size={18} color={tokens.colors.onPrimary} />
                  <Text style={styles.githubButtonText}>
                    {t('settings.syncBackup.enableSync')}
                  </Text>
                </AnimatedPressable>
              ) : (
                <>
                  <View style={styles.actionRow}>
                    <AnimatedPressable
                      style={styles.primaryButton}
                      onPress={onOpenPairNewDevice}
                    >
                      <Sliders size={18} color={tokens.colors.onPrimary} />
                      <Text style={styles.githubButtonText}>
                        {t('settings.syncBackup.pairNewDevice')}
                      </Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                      style={[
                        styles.outlineButton,
                        pairedDevices.length === 0 && styles.disabledButton,
                      ]}
                      disabled={pairedDevices.length === 0}
                      onPress={onOpenPairedDevices}
                    >
                      <RefreshCw
                        size={15}
                        color={tokens.colors.textSecondary}
                      />
                      <Text style={styles.outlineButtonText}>
                        {t('settings.syncBackup.pairedDevices')}
                      </Text>
                    </AnimatedPressable>
                  </View>

                  <AnimatedPressable
                    style={styles.stopSyncButton}
                    onPress={onToggleSync}
                  >
                    <AlertTriangle
                      size={16}
                      color={tokens.colors.accentDanger}
                    />
                    <Text style={styles.stopSyncButtonText}>
                      {t('settings.syncBackup.stopSync')}
                    </Text>
                  </AnimatedPressable>
                </>
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <ScrollText size={16} color={tokens.colors.primary} />
                <Text style={styles.sectionTitle}>
                  {t('sync.info.debugLog.title')}
                </Text>
                <AnimatedPressable
                  style={styles.refreshButton}
                  onPress={onRefreshSyncLogs}
                >
                  <RefreshCw size={12} color={tokens.colors.textSecondary} />
                  <Text style={styles.refreshButtonText}>
                    {t('sync.info.debugLog.refresh')}
                  </Text>
                </AnimatedPressable>
              </View>

              {syncLogs.length === 0 ? (
                <Text style={styles.rowSubtitle}>
                  {t('sync.info.debugLog.empty')}
                </Text>
              ) : (
                syncLogs
                  .slice(0, 200)
                  .map((entry) => (
                    <LogRow
                      key={`${entry.ts}-${entry.scope}-${entry.key}-${entry.message}`}
                      entry={entry}
                      styles={styles}
                      tokens={tokens}
                    />
                  ))
              )}
            </View>
          </ScrollView>
        ) : (
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
                <RefreshCw size={16} color={tokens.colors.primary} />
                <Text style={styles.sectionTitle}>
                  {t('settings.syncStatus.title')}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  {t('settings.syncStatus.status')}
                </Text>
                <Text style={styles.infoValue}>
                  {syncActive
                    ? t('settings.syncStatus.syncingWith', {
                        count: syncPeers,
                      })
                    : t('settings.syncStatus.off')}
                </Text>
              </View>
              <View style={styles.infoRowLast}>
                <Text style={styles.infoLabel}>
                  {t('settings.syncStatus.lastSuccessfulSync')}
                </Text>
                <Text style={styles.infoValue}>
                  {lastSyncedAt
                    ? new Date(lastSyncedAt).toLocaleString()
                    : t('sync.info.never')}
                </Text>
              </View>
              {syncError ? (
                <Text style={styles.syncErrorText}>{syncError}</Text>
              ) : null}
              <AnimatedPressable
                style={styles.githubButton}
                onPress={syncActive ? onOpenSyncQuickStatus : onOpenSyncSetup}
              >
                <RefreshCw size={18} color={tokens.colors.onPrimary} />
                <Text style={styles.githubButtonText}>
                  {syncActive
                    ? t('settings.syncStatus.manage')
                    : t('settings.syncBackup.enableSync')}
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

            {syncActive ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Users size={16} color={tokens.colors.primary} />
                  <Text style={styles.sectionTitle}>
                    {t('settings.pairingDevices.title')}
                  </Text>
                </View>
                <Text style={styles.rowSubtitle}>
                  {pairedDevices.length > 0
                    ? t('settings.pairingDevices.count', {
                        count: pairedDevices.length,
                      })
                    : t('settings.syncBackup.noDevices')}
                </Text>
                <View style={styles.actionRow}>
                  <AnimatedPressable
                    style={styles.primaryButton}
                    onPress={onOpenPairNewDevice}
                  >
                    <Sliders size={18} color={tokens.colors.onPrimary} />
                    <Text style={styles.githubButtonText}>
                      {t('settings.syncBackup.pairNewDevice')}
                    </Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={[
                      styles.outlineButton,
                      pairedDevices.length === 0 && styles.disabledButton,
                    ]}
                    disabled={pairedDevices.length === 0}
                    onPress={onOpenPairedDevices}
                  >
                    <Users size={15} color={tokens.colors.textSecondary} />
                    <Text style={styles.outlineButtonText}>
                      {t('settings.syncBackup.pairedDevices')}
                    </Text>
                  </AnimatedPressable>
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Info size={16} color={tokens.colors.primary} />
                <Text style={styles.sectionTitle}>
                  {t('settings.syncAdvanced.title')}
                </Text>
              </View>
              <Text style={styles.rowSubtitle}>
                {t('settings.syncAdvanced.description')}
              </Text>
              <View style={styles.actionRow}>
                <AnimatedPressable
                  style={styles.outlineButton}
                  onPress={() => onSyncHubOpenChange(true)}
                >
                  <Info size={15} color={tokens.colors.textSecondary} />
                  <Text style={styles.outlineButtonText}>
                    {t('settings.syncBackup.openSyncHub')}
                  </Text>
                </AnimatedPressable>
                {syncActive ? (
                  <AnimatedPressable
                    style={styles.stopSyncButtonInline}
                    onPress={onToggleSync}
                  >
                    <AlertTriangle
                      size={15}
                      color={tokens.colors.accentDanger}
                    />
                    <Text style={styles.stopSyncButtonText}>
                      {t('settings.syncBackup.stopSync')}
                    </Text>
                  </AnimatedPressable>
                ) : null}
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
              <AnimatedPressable
                style={styles.resetButton}
                onPress={onResetData}
              >
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

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Info size={16} color={tokens.colors.primary} />
                <Text style={styles.sectionTitle}>
                  {t('settings.appInfo.title')}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  {t('settings.appInfo.name')}
                </Text>
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
        )}
      </View>
    </AnimatedScreenModal>
  );
}

interface CopyRowProps {
  styles: ReturnType<typeof createStyles>;
  tokens: ThemeTokens;
  label: string | null;
  value: string | null;
  display: string | null;
  copied: boolean;
  onCopy: () => void;
  copyLabel: string;
  copiedLabel: string;
}

function CopyRow({
  styles,
  tokens,
  label,
  value,
  display,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
}: CopyRowProps) {
  return (
    <View style={styles.copyRow}>
      <View style={styles.copyRowText}>
        {label ? <Text style={styles.infoLabel}>{label}</Text> : null}
        <Text style={styles.infoValue}>{display ?? '—'}</Text>
      </View>
      <AnimatedPressable
        style={[styles.copyButton, !value && styles.disabledButton]}
        disabled={!value}
        onPress={onCopy}
      >
        <Copy size={13} color={tokens.colors.textSecondary} />
        <Text style={styles.copyButtonText}>
          {copied ? copiedLabel : copyLabel}
        </Text>
      </AnimatedPressable>
    </View>
  );
}

interface LogRowProps {
  entry: SyncLogEntry;
  styles: ReturnType<typeof createStyles>;
  tokens: ThemeTokens;
}

function LogRow({ entry, styles, tokens }: LogRowProps) {
  const levelColor =
    entry.level === 'error'
      ? tokens.colors.accentDanger
      : entry.level === 'warn'
        ? tokens.colors.accentWarning
        : tokens.colors.textSecondary;

  return (
    <View style={styles.logRow}>
      <View style={styles.logHeaderRow}>
        <Text style={styles.logTime}>{formatTime(entry.ts)}</Text>
        <Text style={[styles.logLevel, { color: levelColor }]}>
          [{entry.level}]
        </Text>
        <Text style={styles.logScope}>{entry.scope}</Text>
        <Text style={styles.logKey}>{entry.key}</Text>
      </View>
      <Text style={styles.logMessage}>{entry.message}</Text>
    </View>
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
    subSectionLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
      marginTop: tokens.spacing.xs,
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
    stopSyncButtonInline: {
      flex: 1,
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
    primaryButton: {
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
    copyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs,
      borderBottomWidth: 0.5,
      borderBottomColor:
        tokens.mode === 'dark'
          ? withAlpha('#d1d1d6', 0.28)
          : withAlpha(tokens.colors.outline, 0.18),
    },
    copyRowText: {
      flex: 1,
      gap: 2,
    },
    copyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs,
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
    },
    copyButtonText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    refreshButton: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs,
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
    },
    refreshButtonText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    logRow: {
      borderBottomWidth: 0.5,
      borderBottomColor:
        tokens.mode === 'dark'
          ? withAlpha('#d1d1d6', 0.2)
          : withAlpha(tokens.colors.outline, 0.15),
      paddingVertical: tokens.spacing.xs,
      gap: 2,
    },
    logHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    logTime: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      fontFamily: 'SpaceGrotesk_600SemiBold',
    },
    logLevel: {
      fontSize: 11,
      fontWeight: '800',
    },
    logScope: {
      color: tokens.colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },
    logKey: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    logMessage: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      lineHeight: 16,
    },
  });
}
