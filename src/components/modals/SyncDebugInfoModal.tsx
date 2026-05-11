import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { SyncLogEntry } from '@/sync/logger';
import type { SyncHealth } from '@/sync/types';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';

interface SyncDebugInfoModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  syncHealth: SyncHealth;
  logEntries: SyncLogEntry[];
  onRefresh: () => Promise<void>;
  onClearLogs?: () => void;
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
  onClearLogs,
  onClose,
}: SyncDebugInfoModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset, layout),
    [tokens, topInset, bottomInset, layout],
  );
  const [visibleCount, setVisibleCount] = useState(LOG_PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error'>(
    'all',
  );
  const [expandedLogIndex, setExpandedLogIndex] = useState<number | null>(null);

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return logEntries;
    return logEntries.filter((entry) => entry.level === filter);
  }, [logEntries, filter]);

  useEffect(() => {
    if (!open) return;
    setVisibleCount(LOG_PAGE_SIZE);
    setExpandedLogIndex(null);
  }, [open]);

  const visibleLogs = filteredLogs.slice(0, visibleCount);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const getLogBorderColor = (level: SyncLogEntry['level']) => {
    switch (level) {
      case 'info':
        return tokens.colors.primary;
      case 'warn':
        return tokens.colors.accentWarning;
      case 'error':
        return tokens.colors.accentDanger;
      default:
        return withAlpha(tokens.colors.outlineVariant, 0.55);
    }
  };

  return (
    <AnimatedScreenModal
      open={open}
      onClose={onClose}
      presentation={layout.isTablet ? 'tablet-sheet' : 'fullscreen'}
      maxWidth={layout.isLandscape ? 1040 : 820}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{t('sync.debug.title')}</Text>
            <Text style={styles.subtitle}>{t('sync.debug.subtitle')}</Text>
          </View>
        </View>

        <FlatList
          data={visibleLogs}
          keyExtractor={(item, index) => `${item.ts}-${item.key}-${index}`}
          onEndReached={() => {
            if (visibleCount < filteredLogs.length) {
              setVisibleCount((count) =>
                Math.min(count + LOG_PAGE_SIZE, filteredLogs.length),
              );
            }
          }}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <View style={styles.headerContent}>
              <View style={styles.actionRow}>
                {onClearLogs ? (
                  <AnimatedPressable
                    style={styles.clearButton}
                    onPress={onClearLogs}
                  >
                    <Text style={styles.clearButtonText}>
                      {t('sync.debug.clear')}
                    </Text>
                  </AnimatedPressable>
                ) : null}
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
                    total: filteredLogs.length,
                  })}
                </Text>
                <View style={styles.filterRow}>
                  {(['all', 'info', 'warn', 'error'] as const).map((f) => (
                    <AnimatedPressable
                      key={f}
                      style={[
                        styles.filterButton,
                        filter === f && styles.filterButtonActive,
                      ]}
                      onPress={() => {
                        setFilter(f);
                        setVisibleCount(LOG_PAGE_SIZE);
                        setExpandedLogIndex(null);
                      }}
                    >
                      <Text
                        style={[
                          styles.filterButtonText,
                          filter === f && styles.filterButtonTextActive,
                        ]}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>
              </View>
            </View>
          }
          renderItem={({ item, index }) => {
            const isExpanded = expandedLogIndex === index;
            return (
              <View
                style={[
                  styles.logRow,
                  { borderLeftColor: getLogBorderColor(item.level) },
                ]}
              >
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
                  <View>
                    <AnimatedPressable
                      style={styles.dataToggle}
                      onPress={() =>
                        setExpandedLogIndex(isExpanded ? null : index)
                      }
                    >
                      <Text style={styles.dataToggleText}>Data</Text>
                      {isExpanded ? (
                        <ChevronUp
                          size={14}
                          color={tokens.colors.textSecondary}
                        />
                      ) : (
                        <ChevronDown
                          size={14}
                          color={tokens.colors.textSecondary}
                        />
                      )}
                    </AnimatedPressable>
                    {isExpanded ? (
                      <Text style={styles.logData}>
                        {JSON.stringify(item.data, null, 2)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.helperText}>
                {t('sync.info.debugLog.empty')}
              </Text>
            </View>
          }
          ListFooterComponent={() =>
            visibleCount < filteredLogs.length ? (
              <AnimatedPressable
                style={styles.loadMoreButton}
                onPress={() =>
                  setVisibleCount((c) =>
                    Math.min(c + LOG_PAGE_SIZE, filteredLogs.length),
                  )
                }
              >
                <Text style={styles.loadMoreText}>Load more</Text>
              </AnimatedPressable>
            ) : (
              <Text style={styles.endOfLogsText}>End of logs</Text>
            )
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
  layout: ReturnType<typeof useResponsiveLayout>,
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
    },
    actionRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      marginBottom: tokens.spacing.md,
    },
    clearButton: {
      minHeight: 36,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.surfaceContainerHigh,
    },
    clearButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
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
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.isLandscape ? 980 : undefined,
    },
    headerContent: {
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.md,
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.isLandscape ? 980 : undefined,
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
      borderLeftWidth: 4,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      padding: tokens.spacing.sm,
      gap: 4,
    },
    dataToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      marginTop: 2,
    },
    dataToggleText: {
      color: tokens.colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },
    filterRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.sm,
    },
    filterButton: {
      flex: 1,
      minHeight: 32,
      borderRadius: tokens.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.surfaceContainerHigh,
    },
    filterButtonActive: {
      backgroundColor: tokens.colors.primary,
    },
    filterButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    filterButtonTextActive: {
      color: tokens.colors.onPrimary,
    },
    loadMoreButton: {
      minHeight: 40,
      borderRadius: tokens.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.surfaceContainerHigh,
      marginTop: tokens.spacing.sm,
    },
    loadMoreText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    endOfLogsText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      textAlign: 'center',
      marginTop: tokens.spacing.md,
      marginBottom: tokens.spacing.sm,
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
