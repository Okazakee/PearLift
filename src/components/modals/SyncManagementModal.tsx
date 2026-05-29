import {
  ChevronDown,
  ChevronUp,
  Copy,
  KeyRound,
  Shield,
  Trash2,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import { AnimatedModalShell } from '@/components/AnimatedModalShell';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { PairedDevice, SyncStateRow } from '@/storage/types';
import type { SyncHealth } from '@/sync/types';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import { Text, TextInput } from '../AppText';

interface SyncManagementModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  syncState: SyncStateRow | null;
  syncHealth: SyncHealth;
  pairedDevices: PairedDevice[];
  localDeviceDisplayName: string;
  masterKey: string | null;
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
  onRefresh: () => Promise<void>;
  onClose: () => void;
}

function getStatusTone(tokens: ThemeTokens, health: SyncHealth) {
  if (health.lastError) return tokens.colors.accentDanger;
  if (health.status === 'synced') return tokens.colors.primary;
  if (health.status === 'connecting') return tokens.colors.accentWarning;
  return tokens.colors.textSecondary;
}

export function SyncManagementModal({
  open,
  tokens,
  topInset,
  bottomInset,
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
  onRefresh,
  onClose,
}: SyncManagementModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset, layout),
    [tokens, topInset, bottomInset, layout],
  );
  const [draftKey, setDraftKey] = useState(masterKey ?? '');
  const [draftDeviceName, setDraftDeviceName] = useState(
    localDeviceDisplayName,
  );
  const [busy, setBusy] = useState<
    null | 'toggle' | 'key' | 'copy' | 'refresh' | 'rename' | 'leave'
  >(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftKey(masterKey ?? '');
    setDraftDeviceName(localDeviceDisplayName);
    setLocalError(null);
    setBusy(null);
  }, [localDeviceDisplayName, masterKey, open]);

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

  const content = (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t('sync.manage.title')}</Text>
          <Text style={styles.subtitle}>{t('sync.manage.subtitle')}</Text>
        </View>
        <AnimatedPressable style={styles.debugButton} onPress={onOpenDebug}>
          <Text style={styles.debugButtonText}>{t('sync.manage.debug')}</Text>
        </AnimatedPressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={busy === 'refresh'}
            onRefresh={() => runBusy('refresh', onRefresh)}
            tintColor={tokens.colors.primary}
          />
        }
      >
        {localError || syncHealth.lastError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>
              {localError ?? syncHealth.lastError}
            </Text>
            <AnimatedPressable
              style={styles.troubleshootButton}
              onPress={onOpenDebug}
            >
              <Text style={styles.troubleshootButtonText}>
                {t('sync.quick.actions.troubleshoot')}
              </Text>
            </AnimatedPressable>
          </View>
        ) : null}

        <View style={styles.statusCard}>
          <View style={styles.statusCardMain}>
            <View style={styles.statusLine}>
              <View
                style={[styles.statusDotLarge, { backgroundColor: statusTone }]}
              />
              <Text style={[styles.statusValueLarge, { color: statusTone }]}>
                {t(`sync.info.status.${syncHealth.status}`)}
              </Text>
            </View>
            <Text style={styles.statusCardMeta}>
              {syncEnabled
                ? t('sync.manage.syncedDevices', {
                    count: pairedDevices.length,
                  })
                : t('sync.quick.state.off')}
            </Text>
            {syncEnabled && syncState?.lastSyncedAt ? (
              <Text style={styles.statusCardMeta}>
                {t('sync.manage.lastSyncAt', { at: lastSyncedLabel })}
              </Text>
            ) : null}
          </View>
          <AnimatedPressable
            style={syncEnabled ? styles.stopButton : styles.startButton}
            onPress={() => runBusy('toggle', () => onToggleSync(!syncEnabled))}
          >
            {busy === 'toggle' ? (
              <ActivityIndicator color={tokens.colors.onPrimary} />
            ) : (
              <Text
                style={
                  syncEnabled ? styles.stopButtonText : styles.startButtonText
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
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Shield size={16} color={tokens.colors.primary} />
              <Text style={styles.sectionTitle}>
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
                selectTextOnFocus
                placeholder={t('sync.manage.deviceNamePlaceholder')}
                placeholderTextColor={tokens.colors.textSecondary}
                style={[styles.keyInput, { flex: 1 }]}
              />
              <AnimatedPressable
                style={styles.smallButton}
                onPress={() =>
                  runBusy('rename', () => onRenameLocalDevice(draftDeviceName))
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
          style={styles.section}
          onPress={() => setAdvancedOpen(!advancedOpen)}
        >
          <View style={styles.sectionHeader}>
            <KeyRound size={16} color={tokens.colors.primary} />
            <Text style={styles.sectionTitle}>
              {t('sync.manage.masterKey')}
            </Text>
            <View style={styles.sectionHeaderRight}>
              {advancedOpen ? (
                <ChevronUp size={16} color={tokens.colors.textSecondary} />
              ) : (
                <ChevronDown size={16} color={tokens.colors.textSecondary} />
              )}
            </View>
          </View>
          <Text style={styles.helperText}>
            {t('sync.manage.masterKeyHint')}
          </Text>
          {advancedOpen ? (
            <>
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
            </>
          ) : null}
        </AnimatedPressable>

        {syncEnabled ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Shield size={16} color={tokens.colors.primary} />
              <Text style={styles.sectionTitle}>
                {t('sync.manage.syncedDevicesTitle')}
              </Text>
            </View>
            {pairedDevices.length === 0 ? (
              <Text style={styles.helperText}>
                {t('sync.manage.noDevices')}
              </Text>
            ) : (
              pairedDevices.map((device) => (
                <View key={device.deviceId} style={styles.deviceRow}>
                  <View style={styles.deviceMeta}>
                    <Text style={styles.deviceName}>{device.displayName}</Text>
                    <Text style={styles.deviceId}>
                      {t('sync.manage.deviceCode', { code: device.deviceCode })}
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
                    <Trash2 size={14} color={tokens.colors.accentDanger} />
                  </AnimatedPressable>
                </View>
              ))
            )}
          </View>
        ) : null}
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
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0, 0, 0, 0.34)',
    },
    tabletPanelSheet: {
      width: layout.isLandscape ? 540 : 460,
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
      gap: tokens.spacing.md,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
    },
    subtitle: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      marginTop: 4,
    },
    debugButton: {
      minHeight: 36,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.surfaceContainerHigh,
    },
    debugButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
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
    statusCard: {
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainer,
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
    statusDotLarge: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    statusValueLarge: {
      fontSize: tokens.type.body,
      fontWeight: '800',
    },
    statusCardMeta: {
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
    troubleshootButton: {
      alignSelf: 'flex-start',
      minHeight: 36,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(tokens.colors.accentDanger, 0.12),
    },
    troubleshootButtonText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      fontWeight: '700',
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
      gap: tokens.spacing.sm,
    },
    sectionHeaderRight: {
      marginLeft: 'auto',
    },
    sectionTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    inlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    smallButton: {
      minHeight: 42,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.surfaceContainerHigh,
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
    startButton: {
      minHeight: 42,
      minWidth: 96,
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
      minHeight: 42,
      minWidth: 96,
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
    actionRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      flexWrap: 'wrap',
    },
    outlineButton: {
      minHeight: 42,
      minWidth: layout.isLandscape ? 180 : 0,
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
      minHeight: 42,
      minWidth: layout.isLandscape ? 180 : 0,
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
    keyInput: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      color: tokens.colors.textPrimary,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      fontSize: 12,
      fontFamily: 'monospace',
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
    deviceId: {
      color: tokens.colors.textPrimary,
      fontSize: 12,
      fontWeight: '600',
      fontFamily: 'monospace',
    },
    deviceName: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    forgetButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(tokens.colors.accentDanger, 0.08),
    },
    leaveButton: {
      minHeight: 42,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.35),
      backgroundColor: withAlpha(tokens.colors.accentDanger, 0.08),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
    },
    leaveButtonText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
  });
}
