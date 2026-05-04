import {
  Copy,
  KeyRound,
  Link2,
  RefreshCw,
  Shield,
  Trash2,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AnimatedPressable } from '../../animation/primitives';
import type { PairedDevice, SyncStateRow } from '../../storage/types';
import type { SyncHealth } from '../../sync/types';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import { AnimatedScreenModal } from '../AnimatedScreenModal';

interface SyncManagementModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  syncState: SyncStateRow | null;
  syncHealth: SyncHealth;
  pairedDevices: PairedDevice[];
  masterKey: string | null;
  onToggleSync: (nextEnabled: boolean) => Promise<void>;
  onApplyMasterKey: (nextKey: string) => Promise<void>;
  onCopyMasterKey: () => Promise<void>;
  onForgetDevice: (deviceId: string) => Promise<void>;
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
  masterKey,
  onToggleSync,
  onApplyMasterKey,
  onCopyMasterKey,
  onForgetDevice,
  onOpenDebug,
  onRefresh,
  onClose,
}: SyncManagementModalProps) {
  const { t } = useTranslation();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );
  const [draftKey, setDraftKey] = useState(masterKey ?? '');
  const [busy, setBusy] = useState<
    null | 'toggle' | 'key' | 'copy' | 'refresh'
  >(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftKey(masterKey ?? '');
    setLocalError(null);
    setBusy(null);
  }, [masterKey, open]);

  const syncEnabled = syncState?.syncEnabled ?? false;
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

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
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
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Link2 size={16} color={tokens.colors.primary} />
              <Text style={styles.sectionTitle}>{t('sync.manage.status')}</Text>
            </View>
            <View style={styles.statusRow}>
              <View style={styles.statusMeta}>
                <View style={styles.statusLine}>
                  <View
                    style={[styles.statusDot, { backgroundColor: statusTone }]}
                  />
                  <Text style={[styles.statusValue, { color: statusTone }]}>
                    {t(`sync.info.status.${syncHealth.status}`)}
                  </Text>
                </View>
                <Text style={styles.helperText}>
                  {t('sync.manage.syncedDevices', {
                    count: pairedDevices.length,
                  })}
                </Text>
                <Text style={styles.helperText}>
                  {t('sync.manage.lastSyncAt', { at: lastSyncedLabel })}
                </Text>
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

            <AnimatedPressable
              style={styles.outlineButton}
              onPress={() => runBusy('refresh', onRefresh)}
            >
              {busy === 'refresh' ? (
                <ActivityIndicator color={tokens.colors.textPrimary} />
              ) : (
                <>
                  <RefreshCw size={16} color={tokens.colors.textPrimary} />
                  <Text style={styles.outlineButtonText}>
                    {t('sync.manage.refresh')}
                  </Text>
                </>
              )}
            </AnimatedPressable>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <KeyRound size={16} color={tokens.colors.primary} />
              <Text style={styles.sectionTitle}>
                {t('sync.manage.masterKey')}
              </Text>
            </View>
            <Text style={styles.helperText}>
              {t('sync.manage.masterKeyHint')}
            </Text>
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
                onPress={() => runBusy('key', () => onApplyMasterKey(draftKey))}
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
          </View>

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
                    <Text style={styles.deviceId}>
                      {device.deviceId.slice(0, 8)}…{device.deviceId.slice(-8)}
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

          {localError || syncHealth.lastError ? (
            <View style={styles.errorPanel}>
              <Text style={styles.errorText}>
                {localError ?? syncHealth.lastError}
              </Text>
            </View>
          ) : null}
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
    sectionTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.md,
    },
    statusMeta: {
      flex: 1,
      gap: 4,
    },
    statusLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    statusDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    statusValue: {
      fontSize: tokens.type.body,
      fontWeight: '800',
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
    },
    outlineButton: {
      minHeight: 42,
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
      fontWeight: '700',
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
    errorPanel: {
      borderRadius: tokens.radius.md,
      backgroundColor: withAlpha(tokens.colors.accentDanger, 0.08),
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.25),
      padding: tokens.spacing.md,
    },
    errorText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      lineHeight: 18,
    },
  });
}
