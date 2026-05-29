import * as Clipboard from 'expo-clipboard';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { IS_E2E } from '@/config/e2e';
import { E2E_IDS } from '@/config/testIds';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { PairedDevice, SyncStateRow } from '@/storage/types';
import type { SyncLogEntry } from '@/sync/logger';
import type { SyncHealth } from '@/sync/types';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import { Text } from '../AppText';

interface SyncDebugInfoModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  syncHealth: SyncHealth;
  syncState: SyncStateRow | null;
  pairedDevices: PairedDevice[];
  localDeviceDisplayName: string;
  logEntries: SyncLogEntry[];
  onRefresh: () => Promise<void>;
  onClearLogs?: () => void;
  onClose: () => void;
}

const LOG_PAGE_SIZE = 50;

type SyncLogFilter = 'all' | 'info' | 'warn' | 'error';

function formatTimestamp(value: string | null | undefined, fallback: string) {
  return value ? new Date(value).toLocaleString() : fallback;
}

function buildSnapshotText(
  syncHealth: SyncHealth,
  syncState: SyncStateRow | null,
  pairedDevices: PairedDevice[],
  localDeviceDisplayName: string,
  neverLabel: string,
) {
  const pendingLocal = syncState?.pendingLocalSummary?.exerciseCount ?? 0;
  const pendingRemote = syncState?.pendingRemoteSummary?.exerciseCount ?? 0;
  const conflictCount =
    (syncState?.pendingConflictSummary?.overlappingWorkoutIds.length ?? 0) +
    (syncState?.pendingConflictSummary?.overlappingExerciseIds.length ?? 0) +
    (syncState?.pendingConflictSummary?.overlappingWeekConfigIds.length ?? 0) +
    (syncState?.pendingConflictSummary?.overlappingDayConfigIds.length ?? 0) +
    (syncState?.pendingConflictSummary?.settingsConflict ? 1 : 0);

  return [
    `status=${syncHealth.status}`,
    `syncMode=${syncHealth.syncMode ?? '-'}`,
    `syncEnabled=${String(syncState?.syncEnabled ?? false)}`,
    `syncRole=${syncState?.syncRole ?? '-'}`,
    `deviceId=${syncState?.deviceId ?? '-'}`,
    `deviceName=${localDeviceDisplayName || '-'}`,
    `roomBindingState=${syncState?.roomBindingState ?? '-'}`,
    `firstSyncResolution=${syncState?.firstSyncResolution ?? '-'}`,
    `peers=${syncHealth.peers}`,
    `connections=${syncHealth.connections}`,
    `pairedDevices=${pairedDevices.length}`,
    `bootstrapped=${String(syncHealth.bootstrapped)}`,
    `reconnectAttempts=${syncHealth.reconnectAttempts}`,
    `lamportCounter=${String(syncState?.lamportCounter ?? 0)}`,
    `pendingLocalMutations=${pendingLocal}`,
    `pendingRemoteMutations=${pendingRemote}`,
    `pendingConflicts=${conflictCount}`,
    `lastSyncedAt=${formatTimestamp(syncHealth.lastSyncedAt, neverLabel)}`,
    `localWriterKey=${syncHealth.localWriterKey ?? '-'}`,
    `autobaseKey=${syncHealth.autobaseKey ?? '-'}`,
    `topicHex=${syncHealth.topicHex ?? '-'}`,
    `lastError=${syncHealth.lastError ?? syncState?.lastError ?? '-'}`,
    `pairedDeviceNames=${pairedDevices.map((device) => device.displayName).join(', ') || '-'}`,
  ].join('\n');
}

function buildLogsText(entries: SyncLogEntry[]) {
  return entries
    .map((entry) =>
      JSON.stringify({
        ts: entry.ts,
        level: entry.level,
        scope: entry.scope,
        key: entry.key,
        message: entry.message,
        data: entry.data ?? null,
      }),
    )
    .join('\n');
}

function buildRecentLogKeys(entries: SyncLogEntry[]) {
  return entries
    .slice(-8)
    .map((entry) => `${entry.scope}/${entry.key}`)
    .join(', ');
}

function formatSummaryCounts(
  summary: SyncStateRow['pendingLocalSummary'] | undefined,
) {
  if (!summary) return '0 workouts, 0 exercises, 0 weights';
  return `${summary.workoutCount} workouts, ${summary.exerciseCount} exercises, ${summary.weightEntryCount} weights`;
}

export function SyncDebugInfoModal({
  open,
  tokens,
  topInset,
  bottomInset,
  syncHealth,
  syncState,
  pairedDevices,
  localDeviceDisplayName,
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
  const [filter, setFilter] = useState<SyncLogFilter>('all');
  const [expandedLogIndex, setExpandedLogIndex] = useState<number | null>(null);

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return logEntries;
    return logEntries.filter((entry) => entry.level === filter);
  }, [filter, logEntries]);

  const snapshotText = useMemo(
    () =>
      buildSnapshotText(
        syncHealth,
        syncState,
        pairedDevices,
        localDeviceDisplayName,
        t('sync.manage.never'),
      ),
    [localDeviceDisplayName, pairedDevices, syncHealth, syncState, t],
  );

  useEffect(() => {
    if (!open) return;
    setVisibleCount(LOG_PAGE_SIZE);
    setExpandedLogIndex(null);
  }, [open]);

  const visibleLogs = filteredLogs.slice(0, visibleCount);
  const rawLogsText = useMemo(() => buildLogsText(logEntries), [logEntries]);
  const recentLogKeys = useMemo(
    () => buildRecentLogKeys(logEntries),
    [logEntries],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleCopySnapshot = async () => {
    await Clipboard.setStringAsync(snapshotText);
  };

  const handleCopyLogs = async () => {
    await Clipboard.setStringAsync(buildLogsText(filteredLogs));
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
          <AnimatedPressable
            style={styles.closeButton}
            onPress={onClose}
            testID={E2E_IDS.syncDebug.close}
          >
            <Text style={styles.closeButtonText}>{t('common.close')}</Text>
          </AnimatedPressable>
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
                    testID={E2E_IDS.syncDebug.clear}
                  >
                    <Text style={styles.clearButtonText}>
                      {t('sync.debug.clear')}
                    </Text>
                  </AnimatedPressable>
                ) : null}
                <AnimatedPressable
                  style={styles.refreshButton}
                  onPress={handleRefresh}
                  testID={E2E_IDS.syncDebug.refresh}
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
              <View style={styles.copyRow}>
                <AnimatedPressable
                  style={styles.copyButton}
                  onPress={handleCopySnapshot}
                  testID={E2E_IDS.syncDebug.copySnapshot}
                >
                  <Text style={styles.copyButtonText}>Copy snapshot</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.copyButton}
                  onPress={handleCopyLogs}
                  testID={E2E_IDS.syncDebug.copyLogs}
                >
                  <Text style={styles.copyButtonText}>Copy logs</Text>
                </AnimatedPressable>
              </View>
              <View
                style={styles.section}
                testID={E2E_IDS.syncDebug.summarySection}
              >
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
                  label="Mode"
                  value={syncHealth.syncMode ?? '—'}
                />
                <DebugRow
                  styles={styles}
                  label="Enabled"
                  value={(syncState?.syncEnabled ?? false) ? 'Yes' : 'No'}
                />
                <DebugRow
                  styles={styles}
                  label="Role"
                  value={syncState?.syncRole ?? '—'}
                />
                <DebugRow
                  styles={styles}
                  label="Device Name"
                  value={localDeviceDisplayName || '—'}
                />
                <DebugRow
                  styles={styles}
                  label="Device ID"
                  value={syncState?.deviceId ?? '—'}
                />
                <DebugRow
                  styles={styles}
                  label="Room State"
                  value={syncState?.roomBindingState ?? '—'}
                  valueTestID={E2E_IDS.syncDebug.roomStateValue}
                />
                <DebugRow
                  styles={styles}
                  label="First Sync Resolution"
                  value={syncState?.firstSyncResolution ?? '—'}
                  valueTestID={E2E_IDS.syncDebug.firstSyncResolutionValue}
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
                  label="Paired Devices"
                  value={String(pairedDevices.length)}
                />
                <DebugRow
                  styles={styles}
                  label="Paired Device Names"
                  value={
                    pairedDevices
                      .map((device) => device.displayName)
                      .join(', ') || '—'
                  }
                  valueTestID={E2E_IDS.syncDebug.pairedDeviceNamesValue}
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
                  label="Lamport Counter"
                  value={String(syncState?.lamportCounter ?? 0)}
                />
                <DebugRow
                  styles={styles}
                  label="Pending Local Summary"
                  value={formatSummaryCounts(syncState?.pendingLocalSummary)}
                />
                <DebugRow
                  styles={styles}
                  label="Pending Remote Summary"
                  value={formatSummaryCounts(syncState?.pendingRemoteSummary)}
                />
                <DebugRow
                  styles={styles}
                  label="Pending Conflicts"
                  value={String(
                    (syncState?.pendingConflictSummary?.overlappingWorkoutIds
                      .length ?? 0) +
                      (syncState?.pendingConflictSummary?.overlappingExerciseIds
                        .length ?? 0) +
                      (syncState?.pendingConflictSummary
                        ?.overlappingWeekConfigIds.length ?? 0) +
                      (syncState?.pendingConflictSummary
                        ?.overlappingDayConfigIds.length ?? 0) +
                      (syncState?.pendingConflictSummary?.settingsConflict
                        ? 1
                        : 0),
                  )}
                />
                <DebugRow
                  styles={styles}
                  label={t('sync.info.lastSync')}
                  value={formatTimestamp(
                    syncHealth.lastSyncedAt,
                    t('sync.manage.never'),
                  )}
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
                  valueTestID={E2E_IDS.syncDebug.autobaseKeyValue}
                />
                <DebugRow
                  styles={styles}
                  label={t('sync.info.topic')}
                  value={syncHealth.topicHex ?? '—'}
                  valueTestID={E2E_IDS.syncDebug.topicHexValue}
                />
                <DebugRow
                  styles={styles}
                  label={t('sync.debug.lastError')}
                  value={syncHealth.lastError ?? syncState?.lastError ?? '—'}
                  valueTestID={E2E_IDS.syncDebug.lastErrorValue}
                />
                <DebugRow
                  styles={styles}
                  label="Recent Log Keys"
                  value={recentLogKeys || '—'}
                  valueTestID={E2E_IDS.syncDebug.recentLogKeysValue}
                />
              </View>

              <View
                style={styles.section}
                testID={E2E_IDS.syncDebug.logsSection}
              >
                <Text style={styles.sectionTitle}>{t('sync.debug.logs')}</Text>
                <Text style={styles.helperText}>
                  {t('sync.debug.logCount', {
                    shown: visibleLogs.length,
                    total: filteredLogs.length,
                  })}
                </Text>
                <View style={styles.filterRow}>
                  {(['all', 'info', 'warn', 'error'] as const).map((value) => (
                    <AnimatedPressable
                      key={value}
                      style={[
                        styles.filterButton,
                        filter === value && styles.filterButtonActive,
                      ]}
                      onPress={() => {
                        setFilter(value);
                        setVisibleCount(LOG_PAGE_SIZE);
                        setExpandedLogIndex(null);
                      }}
                      testID={E2E_IDS.syncDebug.filter(value)}
                    >
                      <Text
                        style={[
                          styles.filterButtonText,
                          filter === value && styles.filterButtonTextActive,
                        ]}
                      >
                        {value.charAt(0).toUpperCase() + value.slice(1)}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>
              </View>
              {IS_E2E ? (
                <>
                  <View style={styles.e2ePayloadSlot}>
                    <Text
                      selectable
                      style={styles.e2eHiddenText}
                      testID={E2E_IDS.syncDebug.rawSnapshot}
                    >
                      {snapshotText}
                    </Text>
                  </View>
                  <View style={styles.e2ePayloadSlot}>
                    <Text
                      selectable
                      style={styles.e2eHiddenText}
                      testID={E2E_IDS.syncDebug.rawLogs}
                    >
                      {rawLogsText || 'no-sync-logs'}
                    </Text>
                  </View>
                </>
              ) : null}
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
                  setVisibleCount((count) =>
                    Math.min(count + LOG_PAGE_SIZE, filteredLogs.length),
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
  valueTestID,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  value: string;
  valueTestID?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} testID={valueTestID}>
        {value}
      </Text>
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.md,
    },
    actionRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      marginBottom: tokens.spacing.md,
      flexWrap: 'wrap',
    },
    copyRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      flexWrap: 'wrap',
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
    closeButton: {
      minHeight: 36,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.surfaceContainerHigh,
    },
    closeButtonText: {
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
    copyButton: {
      minHeight: 36,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.surfaceContainerHigh,
    },
    copyButtonText: {
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
    e2ePayloadSlot: {
      height: 1,
      opacity: 0.01,
      overflow: 'hidden',
      width: '100%',
    },
    e2eHiddenText: {
      opacity: 0.01,
      color: 'transparent',
      fontSize: 1,
      lineHeight: 1,
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
