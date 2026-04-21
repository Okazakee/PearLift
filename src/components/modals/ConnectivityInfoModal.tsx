import * as Clipboard from 'expo-clipboard';
import { ChevronLeft, Copy, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../../animation/primitives';
import type { SyncStatus } from '../../sync/types';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import { AnimatedScreenModal } from '../AnimatedScreenModal';

interface ConnectivityInfoModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  syncStatus: SyncStatus;
  syncPeers: number;
  syncPeerKeys: string[];
  syncLocalPublicKey: string | null;
  syncAutobaseKey: string | null;
  syncTopicHex: string | null;
  syncBootstrapped: boolean;
  lastSyncedAt: string | null;
  deviceId: string | null;
  onClose: () => void;
}

function truncate(value: string | null | undefined, head = 10, tail = 8) {
  if (!value) return null;
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function ConnectivityInfoModal({
  open,
  tokens,
  topInset,
  bottomInset,
  syncStatus,
  syncPeers,
  syncPeerKeys,
  syncLocalPublicKey,
  syncAutobaseKey,
  syncTopicHex,
  syncBootstrapped,
  lastSyncedAt,
  deviceId,
  onClose,
}: ConnectivityInfoModalProps) {
  const { t } = useTranslation();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = async (key: string, value: string | null) => {
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

  const statusColor =
    syncStatus === 'synced'
      ? tokens.colors.primary
      : syncStatus === 'error'
        ? tokens.colors.accentDanger
        : tokens.colors.textSecondary;

  const rows: Array<{
    key: string;
    label: string;
    value: string | null;
    display?: string | null;
  }> = [
    {
      key: 'deviceId',
      label: t('sync.info.deviceId'),
      value: deviceId,
      display: truncate(deviceId),
    },
    {
      key: 'localKey',
      label: t('sync.info.localKey'),
      value: syncLocalPublicKey,
      display: truncate(syncLocalPublicKey),
    },
  ];

  const groupRows: Array<{ key: string; label: string; value: string | null }> =
    [
      {
        key: 'autobaseKey',
        label: t('sync.info.autobaseKey'),
        value: syncAutobaseKey,
      },
      { key: 'topic', label: t('sync.info.topic'), value: syncTopicHex },
    ];

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={onClose}>
            <ChevronLeft size={22} color={tokens.colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.title}>{t('sync.info.title')}</Text>
          <View style={styles.backButtonPlaceholder} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.panel}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>{t('sync.info.statusLabel')}</Text>
              <Text style={[styles.statValue, { color: statusColor }]}>
                {t(`sync.info.status.${syncStatus}`)}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>{t('sync.info.peers')}</Text>
              <Text style={styles.statValue}>{syncPeers}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>
                {t('sync.info.bootstrapped')}
              </Text>
              <Text style={styles.statValue}>
                {syncBootstrapped
                  ? t('sync.info.bootstrappedYes')
                  : t('sync.info.bootstrappedNo')}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>{t('sync.info.lastSync')}</Text>
              <Text style={styles.statValue}>
                {lastSyncedAt
                  ? new Date(lastSyncedAt).toLocaleString()
                  : t('sync.info.never')}
              </Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('sync.info.thisDevice')}</Text>
          </View>
          <View style={styles.panel}>
            {rows.map((row) => (
              <KeyRow
                key={row.key}
                styles={styles}
                tokens={tokens}
                label={row.label}
                value={row.value}
                display={row.display ?? null}
                copied={copiedKey === row.key}
                onCopy={() => void copy(row.key, row.value)}
                copyLabel={t('sync.info.copy')}
                copiedLabel={t('sync.info.copied')}
              />
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('sync.info.syncGroup')}</Text>
          </View>
          <View style={styles.panel}>
            {groupRows.map((row) => (
              <KeyRow
                key={row.key}
                styles={styles}
                tokens={tokens}
                label={row.label}
                value={row.value}
                display={truncate(row.value)}
                copied={copiedKey === row.key}
                onCopy={() => void copy(row.key, row.value)}
                copyLabel={t('sync.info.copy')}
                copiedLabel={t('sync.info.copied')}
              />
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <Users size={14} color={tokens.colors.textSecondary} />
            <Text style={styles.sectionTitle}>
              {t('sync.info.connectedPeers')} ({syncPeerKeys.length})
            </Text>
          </View>
          <View style={styles.panel}>
            {syncPeerKeys.length === 0 ? (
              <Text style={styles.emptyText}>{t('sync.info.noPeers')}</Text>
            ) : (
              syncPeerKeys.map((key) => (
                <KeyRow
                  key={`peer-${key}`}
                  styles={styles}
                  tokens={tokens}
                  label={null}
                  value={key}
                  display={truncate(key)}
                  copied={copiedKey === `peer-${key}`}
                  onCopy={() => void copy(`peer-${key}`, key)}
                  copyLabel={t('sync.info.copy')}
                  copiedLabel={t('sync.info.copied')}
                />
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </AnimatedScreenModal>
  );
}

interface KeyRowProps {
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

function KeyRow({
  styles,
  tokens,
  label,
  display,
  value,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
}: KeyRowProps) {
  return (
    <View style={styles.keyRow}>
      <View style={styles.keyRowText}>
        {label ? <Text style={styles.keyLabel}>{label}</Text> : null}
        <Text style={styles.keyValue}>{display ?? '—'}</Text>
      </View>
      <AnimatedPressable
        style={[styles.copyButton, !value && styles.copyButtonDisabled]}
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
    panel: {
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: tokens.spacing.sm,
    },
    sectionTitle: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: tokens.spacing.xs,
      borderBottomWidth: 0.5,
      borderBottomColor: withAlpha(tokens.colors.outline, 0.18),
    },
    statLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '500',
    },
    statValue: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontFamily: 'SpaceGrotesk_600SemiBold',
    },
    keyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs,
    },
    keyRowText: {
      flex: 1,
      gap: 2,
    },
    keyLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    keyValue: {
      color: tokens.colors.textPrimary,
      fontSize: 12,
      fontFamily: 'SpaceGrotesk_600SemiBold',
    },
    copyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 6,
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
    },
    copyButtonDisabled: {
      opacity: 0.4,
    },
    copyButtonText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    emptyText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
  });
}
