import {
  ChevronDown,
  ChevronUp,
  Copy,
  KeyRound,
  Shield,
  Trash2,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AnimatedFadeInView, AnimatedPressable } from '@/animation/primitives';
import type { SettingsStyles } from '@/components/modals/settings/SettingsModal.styles';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { PairedDevice, SyncStateRow } from '@/storage/types';
import type { SyncHealth } from '@/sync/types';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';

const DEVICES_PER_PAGE = 3;

function getStatusTone(tokens: ThemeTokens, health: SyncHealth) {
  if (health.lastError) return tokens.colors.accentDanger;
  if (health.status === 'synced') return tokens.colors.primary;
  if (health.status === 'connecting') return tokens.colors.accentWarning;
  return tokens.colors.textSecondary;
}

interface SyncSectionProps {
  tokens: ThemeTokens;
  styles: SettingsStyles;
  syncState: SyncStateRow | null;
  syncHealth: SyncHealth;
  pairedDevices: PairedDevice[];
  localDeviceDisplayName: string;
  masterKey: string | null;
  defaultExpanded?: boolean;
  onToggleSync: (nextEnabled: boolean) => Promise<void>;
  onOpenCreateRoom: () => void;
  onOpenJoinRoom: () => void;
  onShowSyncQR?: () => void;
  onApplyMasterKey: (nextKey: string) => Promise<void>;
  onRenameLocalDevice: (displayName: string) => Promise<void>;
  onCopyMasterKey: () => Promise<void>;
  onForgetDevice: (deviceId: string) => Promise<void>;
  onLeaveRoom: () => Promise<void>;
  onOpenDebug: () => void;
}

export function SyncSection({
  tokens,
  styles: settingsStyles,
  syncState,
  syncHealth,
  pairedDevices,
  localDeviceDisplayName,
  masterKey,
  defaultExpanded = false,
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
}: SyncSectionProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(tokens, layout), [tokens, layout]);

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [draftKey, setDraftKey] = useState(masterKey ?? '');
  const [draftDeviceName, setDraftDeviceName] = useState(
    localDeviceDisplayName,
  );
  const [busy, setBusy] = useState<
    null | 'toggle' | 'key' | 'copy' | 'rename' | 'leave'
  >(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [devicesVisible, setDevicesVisible] = useState(DEVICES_PER_PAGE);

  const syncEnabled = syncState?.syncEnabled ?? false;
  const roomRole = syncState?.syncRole ?? null;
  const statusTone = getStatusTone(tokens, syncHealth);
  const lastSyncedLabel = syncState?.lastSyncedAt
    ? new Date(syncState.lastSyncedAt).toLocaleString()
    : t('sync.manage.never');

  const runBusy = async (
    nextBusy: NonNullable<typeof busy>,
    task: () => Promise<void>,
  ) => {
    setLocalError(null);
    setBusy(nextBusy);
    try {
      await task();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const visibleDevices = pairedDevices.slice(0, devicesVisible);
  const hasMoreDevices = pairedDevices.length > devicesVisible;

  return (
    <View style={settingsStyles.section}>
      <AnimatedPressable
        style={settingsStyles.row}
        onPress={() => setExpanded(!expanded)}
      >
        <View style={settingsStyles.rowText}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: statusTone,
              }}
            />
            <Text style={settingsStyles.rowTitle}>
              {t('settings.syncBackup.title')}
            </Text>
          </View>
          {syncEnabled && syncState?.lastSyncedAt ? (
            <Text style={settingsStyles.rowSubtitle}>
              {t('sync.manage.lastSyncAt', { at: lastSyncedLabel })}
            </Text>
          ) : null}
        </View>
        <Text
          style={[
            {
              fontSize: tokens.type.label,
              fontWeight: '700',
              color: syncEnabled
                ? tokens.colors.primary
                : tokens.colors.textSecondary,
            },
          ]}
        >
          {syncEnabled
            ? t('settings.syncStatus.enabled')
            : t('settings.syncStatus.disabled')}
        </Text>
        {expanded ? (
          <ChevronUp size={18} color={tokens.colors.textMuted} />
        ) : (
          <ChevronDown size={18} color={tokens.colors.textMuted} />
        )}
      </AnimatedPressable>

      {expanded ? (
        <AnimatedFadeInView>
          <View style={styles.expandedContent}>
            {localError || syncHealth.lastError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>
                  {localError ?? syncHealth.lastError}
                </Text>
              </View>
            ) : null}

            <View style={styles.statusCard}>
              <View style={styles.statusCardMain}>
                <View style={styles.statusLine}>
                  <View
                    style={[styles.statusDot, { backgroundColor: statusTone }]}
                  />
                  <Text style={[styles.statusValue, { color: statusTone }]}>
                    {t(`sync.info.status.${syncHealth.status}`)}
                  </Text>
                </View>
                <Text style={styles.statusMeta}>
                  {syncEnabled
                    ? t('sync.manage.syncedDevices', {
                        count: pairedDevices.length,
                      })
                    : t('sync.quick.state.off')}
                </Text>
                {syncEnabled && syncState?.lastSyncedAt ? (
                  <Text style={styles.statusMeta}>
                    {t('sync.manage.lastSyncAt', { at: lastSyncedLabel })}
                  </Text>
                ) : null}
              </View>
              <AnimatedPressable
                style={syncEnabled ? styles.stopButton : styles.startButton}
                onPress={() =>
                  runBusy('toggle', () => onToggleSync(!syncEnabled))
                }
              >
                {busy === 'toggle' ? (
                  <ActivityIndicator color={tokens.colors.onPrimary} />
                ) : (
                  <Text
                    style={
                      syncEnabled
                        ? styles.stopButtonText
                        : styles.startButtonText
                    }
                  >
                    {syncEnabled
                      ? t('sync.manage.turnOff')
                      : t('sync.manage.turnOn')}
                  </Text>
                )}
              </AnimatedPressable>
            </View>

            {!syncEnabled ? (
              <View style={styles.actionRow}>
                <AnimatedPressable
                  style={styles.primaryButton}
                  onPress={onOpenCreateRoom}
                >
                  <Text style={styles.primaryButtonText}>
                    {t('sync.manage.createRoom')}
                  </Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.outlineButton}
                  onPress={onOpenJoinRoom}
                >
                  <Text style={styles.outlineButtonText}>
                    {t('sync.manage.joinRoom')}
                  </Text>
                </AnimatedPressable>
              </View>
            ) : (
              <View style={styles.actionRow}>
                {roomRole === 'creator' ? (
                  <AnimatedPressable
                    style={styles.outlineButton}
                    onPress={onShowSyncQR}
                  >
                    <Text style={styles.outlineButtonText}>
                      {t('sync.manage.showQR')}
                    </Text>
                  </AnimatedPressable>
                ) : null}
                <AnimatedPressable
                  style={styles.leaveButton}
                  onPress={() => runBusy('leave', onLeaveRoom)}
                >
                  {busy === 'leave' ? (
                    <ActivityIndicator color={tokens.colors.accentDanger} />
                  ) : (
                    <Text style={styles.leaveButtonText}>
                      {t('sync.manage.leaveRoom')}
                    </Text>
                  )}
                </AnimatedPressable>
              </View>
            )}

            {syncState?.deviceId ? (
              <View style={styles.inlineSection}>
                <View style={settingsStyles.sectionHeader}>
                  <Shield size={14} color={tokens.colors.primary} />
                  <Text style={settingsStyles.sectionTitle}>
                    {t('sync.manage.thisDeviceCode', {
                      code: syncState.deviceId.slice(-4).toUpperCase(),
                    })}
                  </Text>
                </View>
                <View style={styles.inlineRow}>
                  <TextInput
                    value={draftDeviceName}
                    onChangeText={setDraftDeviceName}
                    autoCapitalize="words"
                    autoCorrect={false}
                    spellCheck={false}
                    placeholder={t('sync.manage.deviceNamePlaceholder')}
                    placeholderTextColor={tokens.colors.textSecondary}
                    style={[styles.keyInput, { flex: 1 }]}
                  />
                  <AnimatedPressable
                    style={styles.smallButton}
                    onPress={() =>
                      runBusy('rename', () =>
                        onRenameLocalDevice(draftDeviceName),
                      )
                    }
                  >
                    {busy === 'rename' ? (
                      <ActivityIndicator color={tokens.colors.textPrimary} />
                    ) : (
                      <Text style={styles.smallButtonText}>
                        {t('sync.manage.saveDeviceName')}
                      </Text>
                    )}
                  </AnimatedPressable>
                </View>
              </View>
            ) : null}

            <AnimatedPressable
              style={styles.inlineSection}
              onPress={() => setAdvancedOpen(!advancedOpen)}
            >
              <View style={settingsStyles.sectionHeader}>
                <KeyRound size={14} color={tokens.colors.primary} />
                <Text style={settingsStyles.sectionTitle}>
                  {t('sync.manage.masterKey')}
                </Text>
                <View style={{ marginLeft: 'auto' }}>
                  {advancedOpen ? (
                    <ChevronUp size={16} color={tokens.colors.textSecondary} />
                  ) : (
                    <ChevronDown
                      size={16}
                      color={tokens.colors.textSecondary}
                    />
                  )}
                </View>
              </View>
              <Text style={styles.helperText}>
                {t('sync.manage.masterKeyHint')}
              </Text>
              {advancedOpen ? (
                <AnimatedFadeInView>
                  <TextInput
                    value={draftKey}
                    onChangeText={setDraftKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    placeholder={t('sync.manage.masterKeyPlaceholder')}
                    placeholderTextColor={tokens.colors.textSecondary}
                    style={styles.keyInput}
                  />
                  <View style={styles.actionRow}>
                    <AnimatedPressable
                      style={styles.outlineButton}
                      onPress={() => runBusy('copy', onCopyMasterKey)}
                    >
                      {busy === 'copy' ? (
                        <ActivityIndicator color={tokens.colors.textPrimary} />
                      ) : (
                        <>
                          <Copy size={16} color={tokens.colors.textPrimary} />
                          <Text style={styles.outlineButtonText}>
                            {t('sync.manage.copyKey')}
                          </Text>
                        </>
                      )}
                    </AnimatedPressable>
                    <AnimatedPressable
                      style={styles.primaryButton}
                      onPress={() =>
                        runBusy('key', () => onApplyMasterKey(draftKey))
                      }
                    >
                      {busy === 'key' ? (
                        <ActivityIndicator color={tokens.colors.onPrimary} />
                      ) : (
                        <Text style={styles.primaryButtonText}>
                          {t('sync.manage.applyKey')}
                        </Text>
                      )}
                    </AnimatedPressable>
                  </View>
                </AnimatedFadeInView>
              ) : null}
            </AnimatedPressable>

            {syncEnabled ? (
              <View style={styles.inlineSection}>
                <View style={settingsStyles.sectionHeader}>
                  <Shield size={14} color={tokens.colors.primary} />
                  <Text style={settingsStyles.sectionTitle}>
                    {t('sync.manage.syncedDevicesTitle')}
                  </Text>
                </View>
                {pairedDevices.length === 0 ? (
                  <Text style={styles.helperText}>
                    {t('sync.manage.noDevices')}
                  </Text>
                ) : (
                  <>
                    {visibleDevices.map((device) => (
                      <View key={device.deviceId} style={styles.deviceRow}>
                        <View style={styles.deviceMeta}>
                          <Text style={styles.deviceName}>
                            {device.displayName}
                          </Text>
                          <Text style={styles.deviceId}>
                            {t('sync.manage.deviceCode', {
                              code: device.deviceCode,
                            })}
                          </Text>
                          <Text style={styles.helperText}>
                            {t('sync.manage.lastSeen', {
                              at: new Date(device.lastSeen).toLocaleString(),
                            })}
                          </Text>
                        </View>
                        <AnimatedPressable
                          style={styles.forgetButton}
                          onPress={() => void onForgetDevice(device.deviceId)}
                        >
                          <Trash2
                            size={14}
                            color={tokens.colors.accentDanger}
                          />
                        </AnimatedPressable>
                      </View>
                    ))}
                    {hasMoreDevices ? (
                      <AnimatedPressable
                        style={styles.showMoreButton}
                        onPress={() =>
                          setDevicesVisible((prev) => prev + DEVICES_PER_PAGE)
                        }
                      >
                        <Text style={styles.showMoreText}>
                          {t('sync.manage.showMore', {
                            count: Math.min(
                              DEVICES_PER_PAGE,
                              pairedDevices.length - devicesVisible,
                            ),
                            defaultValue: 'Show {{count}} more',
                          })}
                        </Text>
                      </AnimatedPressable>
                    ) : null}
                  </>
                )}
              </View>
            ) : null}

            <AnimatedPressable style={styles.debugButton} onPress={onOpenDebug}>
              <Text style={styles.debugButtonText}>
                {t('sync.manage.debug')}
              </Text>
            </AnimatedPressable>
          </View>
        </AnimatedFadeInView>
      ) : null}
    </View>
  );
}

function createStyles(
  tokens: ThemeTokens,
  _layout: ReturnType<typeof useResponsiveLayout>,
) {
  return StyleSheet.create({
    expandedContent: {
      gap: tokens.spacing.md,
      paddingTop: tokens.spacing.xs,
    },
    statusCard: {
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      padding: tokens.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.md,
    },
    statusCardMain: {
      flex: 1,
      gap: 4,
    },
    statusLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    statusValue: {
      fontSize: tokens.type.body,
      fontWeight: '800',
    },
    statusMeta: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      lineHeight: 18,
    },
    errorBanner: {
      borderRadius: tokens.radius.lg,
      backgroundColor: withAlpha(tokens.colors.accentDanger, 0.08),
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.25),
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    errorBannerText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      lineHeight: 18,
    },
    actionRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      flexWrap: 'wrap',
    },
    startButton: {
      minHeight: 40,
      minWidth: 88,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
    },
    startButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
    stopButton: {
      minHeight: 40,
      minWidth: 88,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.35),
      backgroundColor: withAlpha(tokens.colors.accentDanger, 0.08),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
    },
    stopButtonText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
    outlineButton: {
      minHeight: 40,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      flex: 1,
    },
    outlineButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    primaryButton: {
      minHeight: 40,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
      flex: 1,
    },
    primaryButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
    leaveButton: {
      minHeight: 40,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.35),
      backgroundColor: withAlpha(tokens.colors.accentDanger, 0.08),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
      flex: 1,
    },
    leaveButtonText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
    inlineSection: {
      gap: tokens.spacing.sm,
      padding: tokens.spacing.md,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainerHigh,
    },
    inlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    keyInput: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHighest,
      color: tokens.colors.textPrimary,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      fontSize: 12,
      fontFamily: 'monospace',
    },
    smallButton: {
      minHeight: 40,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.surfaceContainerHighest,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
    },
    smallButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    helperText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      lineHeight: 18,
    },
    deviceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.md,
      paddingVertical: tokens.spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(tokens.colors.outlineVariant, 0.45),
    },
    deviceMeta: {
      flex: 1,
      gap: 4,
    },
    deviceName: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    deviceId: {
      color: tokens.colors.textPrimary,
      fontSize: 12,
      fontWeight: '600',
      fontFamily: 'monospace',
    },
    forgetButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(tokens.colors.accentDanger, 0.08),
    },
    showMoreButton: {
      minHeight: 36,
      borderRadius: tokens.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(tokens.colors.primary, 0.08),
      marginTop: tokens.spacing.xs,
    },
    showMoreText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    debugButton: {
      minHeight: 36,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.surfaceContainerHigh,
      alignSelf: 'flex-start',
    },
    debugButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
  });
}
