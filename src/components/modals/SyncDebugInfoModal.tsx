import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AnimatedPressable } from '../../animation/primitives';
import type { SyncLogEntry } from '../../sync/logger';
import type { SyncHealth } from '../../sync/types';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import { AnimatedScreenModal } from '../AnimatedScreenModal';

interface SyncDebugInfoModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  syncHealth: SyncHealth;
  logEntries: SyncLogEntry[];
  onRefresh: () => Promise<void>;
  onClose: () => void;
}

const LOG_PAGE_SIZE = 50;

export function SyncDebugInfoModal({
  open,
  tokens,
  topInset,
  bottomInset,
  syncHealth,
  logEntries,
  onRefresh,
  onClose,
}: SyncDebugInfoModalProps) {
  const { t } = useTranslation();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );
  const [visibleCount, setVisibleCount] = useState(LOG_PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVisibleCount(LOG_PAGE_SIZE);
  }, [open]);

  const visibleLogs = logEntries.slice(0, visibleCount);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{t('sync.debug.title')}</Text>
            <Text style={styles.subtitle}>{t('sync.debug.subtitle')}</Text>
          </View>
          <AnimatedPressable
            style={styles.refreshButton}
            onPress={handleRefresh}
          >
            {refreshing ? (
              <ActivityIndicator color={tokens.colors.textPrimary} />
            ) : (
              <Text style={styles.refreshButtonText}>
                {t('sync.manage.refresh')}
              </Text>
            )}
          </AnimatedPressable>
        </View>

        <FlatList
          data={visibleLogs}
          keyExtractor={(item, index) => `${item.ts}-${item.key}-${index}`}
          onEndReached={() => {
            if (visibleCount < logEntries.length) {
              setVisibleCount((count) =>
                Math.min(count + LOG_PAGE_SIZE, logEntries.length),
              );
            }
          }}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <View style={styles.headerContent}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {t('sync.debug.snapshot')}
                </Text>
                <DebugRow
                  styles={styles}
                  label={t('sync.info.statusLabel')}
                  value={t(`sync.info.status.${syncHealth.status}`)}
                />
                <DebugRow
                  styles={styles}
                  label={t('sync.info.peers')}
                  value={String(syncHealth.peers)}
                />
                <DebugRow
                  styles={styles}
                  label={t('sync.debug.connections')}
                  value={String(syncHealth.connections)}
                />
                <DebugRow
                  styles={styles}
                  label={t('sync.info.bootstrapped')}
                  value={
                    syncHealth.bootstrapped
                      ? t('sync.info.bootstrappedYes')
                      : t('sync.info.bootstrappedNo')
                  }
                />
                <DebugRow
                  styles={styles}
                  label={t('sync.info.reconnectAttempts')}
                  value={String(syncHealth.reconnectAttempts)}
                />
                <DebugRow
                  styles={styles}
                  label={t('sync.info.lastSync')}
                  value={
                    syncHealth.lastSyncedAt
                      ? new Date(syncHealth.lastSyncedAt).toLocaleString()
                      : t('sync.manage.never')
                  }
                />
                <DebugRow
                  styles={styles}
                  label={t('sync.info.localKey')}
                  value={syncHealth.localWriterKey ?? '—'}
                />
                <DebugRow
                  styles={styles}
                  label={t('sync.info.autobaseKey')}
                  value={syncHealth.autobaseKey ?? '—'}
                />
                <DebugRow
                  styles={styles}
                  label={t('sync.info.topic')}
                  value={syncHealth.topicHex ?? '—'}
                />
                <DebugRow
                  styles={styles}
                  label={t('sync.debug.lastError')}
                  value={syncHealth.lastError ?? '—'}
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('sync.debug.logs')}</Text>
                <Text style={styles.helperText}>
                  {t('sync.debug.logCount', {
                    shown: visibleLogs.length,
                    total: logEntries.length,
                  })}
                </Text>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.logRow}>
              <View style={styles.logMeta}>
                <Text style={styles.logTime}>
                  {new Date(item.ts).toLocaleTimeString()}
                </Text>
                <Text style={styles.logScope}>
                  {item.level.toUpperCase()} · {item.scope}/{item.key}
                </Text>
              </View>
              <Text style={styles.logMessage}>{item.message}</Text>
              {item.data ? (
                <Text style={styles.logData}>
                  {JSON.stringify(item.data, null, 0)}
                </Text>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.helperText}>
                {t('sync.info.debugLog.empty')}
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </AnimatedScreenModal>
  );
}

function DebugRow({
  styles,
  label,
  value,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
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
    refreshButton: {
      minHeight: 36,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.surfaceContainerHigh,
    },
    refreshButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    listContent: {
      padding: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.xxl,
      gap: tokens.spacing.sm,
    },
    headerContent: {
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.md,
    },
    section: {
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    sectionTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    helperText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      lineHeight: 18,
    },
    infoRow: {
      gap: 4,
    },
    infoLabel: {
      color: tokens.colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    infoValue: {
      color: tokens.colors.textPrimary,
      fontSize: 12,
      fontFamily: 'monospace',
    },
    logRow: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.outlineVariant, 0.55),
      backgroundColor: tokens.colors.surfaceContainerHigh,
      padding: tokens.spacing.sm,
      gap: 4,
    },
    logMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: tokens.spacing.sm,
    },
    logTime: {
      color: tokens.colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },
    logScope: {
      color: tokens.colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      flexShrink: 1,
      textAlign: 'right',
    },
    logMessage: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      lineHeight: 18,
    },
    logData: {
      color: tokens.colors.textSecondary,
      fontSize: 11,
      fontFamily: 'monospace',
    },
    emptyState: {
      paddingVertical: tokens.spacing.xl,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
