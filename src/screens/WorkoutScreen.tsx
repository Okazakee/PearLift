import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import {
  EncodingType,
  StorageAccessFramework,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, useColorScheme, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  computeImportDiff,
  getBackupFileName,
  parseAndMigrateBackup,
  serializePwaBackupV2,
  toPwaBackupV2,
} from '@/backup/localBackup';
import {
  assembleChunkedPackets,
  decodeQrPayload,
} from '@/backup/qrBackupCodec';
import { BootstrapScreen } from '@/components/BootstrapScreen';
import { Header } from '@/components/Header';
import { AddExerciseModal } from '@/components/modals/AddExerciseModal';
import { AppPromptModal } from '@/components/modals/AppPromptModal';
import { BackupActionModal } from '@/components/modals/BackupActionModal';
import { ImportPreviewModal } from '@/components/modals/ImportPreviewModal';
import { LanguageListModal } from '@/components/modals/LanguageListModal';
import { ProgramSettingsModal } from '@/components/modals/ProgramSettingsModal';
import { ScanFromDeviceModal } from '@/components/modals/ScanFromDeviceModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { ShareToDeviceModal } from '@/components/modals/ShareToDeviceModal';
import { SyncCreateRoomModal } from '@/components/modals/SyncCreateRoomModal';
import { SyncDebugInfoModal } from '@/components/modals/SyncDebugInfoModal';
import { SyncFirstDecisionModal } from '@/components/modals/SyncFirstDecisionModal';
import { SyncJoinRoomModal } from '@/components/modals/SyncJoinRoomModal';
import { SyncQuickInfoModal } from '@/components/modals/SyncQuickInfoModal';
import { SyncRoomKeyScanModal } from '@/components/modals/SyncRoomKeyScanModal';
import { Navigation } from '@/components/Navigation';
import { OnboardingScreen } from '@/components/OnboardingScreen';
import { RestTimer } from '@/components/RestTimer';
import { WorkoutDayStack } from '@/components/WorkoutDayStack';
import { APP_CONFIG } from '@/config/app';
import { defaultDayConfigs } from '@/data/workouts';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import i18n, { SUPPORTED_I18N_LANGUAGE_CODES } from '@/i18n';
import { useSystemLanguage } from '@/i18n/systemLanguage';
import { styles } from '@/screens/styles';
import { useWorkoutStore } from '@/store/workoutStore';
import { summarizeRuntime } from '@/sync/firstSync';
import { clearRecentLogs } from '@/sync/logger';
import { decodeSyncRoomInvite, encodeSyncRoomInvite } from '@/sync/roomInvite';
import {
  getPairingSecretPayload,
  setPairingSecretPayload,
} from '@/sync/syncManager';
import type { ThemeMode, ThemePreference } from '@/theme/tokens';
import { getThemeTokens, resolveThemeMode } from '@/theme/tokens';
import type { Exercise, WeightUnit, WorkoutDay } from '@/types';
import { getErrorMessage, logError } from '@/utils/errors';
import { roundToHalf } from '@/utils/math';
import {
  fromDisplayWeight,
  roundToIncrement,
  toDisplayWeight,
} from '@/utils/units';

export function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const responsiveLayout = useResponsiveLayout();
  const systemScheme = useColorScheme();
  const systemLanguage = useSystemLanguage(SUPPORTED_I18N_LANGUAGE_CODES, 'en');
  const { t } = useTranslation();

  const [shareToDeviceOpen, setShareToDeviceOpen] = useState(false);
  const [scanFromDeviceOpen, setScanFromDeviceOpen] = useState(false);
  const [backupActionMode, setBackupActionMode] = useState<
    'local' | 'qr' | null
  >(null);
  const [syncMasterKey, setSyncMasterKey] = useState<string | null>(null);
  const [syncRoomInvite, setSyncRoomInvite] = useState<string | null>(null);
  const [createRoomStarting, setCreateRoomStarting] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [joinRoomOpen, setJoinRoomOpen] = useState(false);
  const [joinRoomScanOpen, setJoinRoomScanOpen] = useState(false);
  const [syncQuickInfoOpen, setSyncQuickInfoOpen] = useState(false);
  const [settingsSyncExpanded, setSettingsSyncExpanded] = useState(false);

  const {
    snapshot,
    isReady,
    repository,
    syncState,
    syncHealth,
    pairedDevices,
    localDeviceDisplayName,
    syncLogs,
    applyMutation,
    reload,
    initialize,
    refreshSyncState,
    refreshSyncLogs,
    startSync,
    stopSync,
    resolveFirstSyncChoice,
    forgetPairedDevice,
    renameLocalDevice,
    leaveSyncRoom,
    promptConfig,
    closePrompt,
    showPrompt,
    exerciseModalOpen,
    exerciseModalMode,
    editingExerciseId,
    setExerciseModalOpen,
    setExerciseModalMode,
    setEditingExerciseId,
    programSettingsOpen,
    setProgramSettingsOpen,
    settingsOpen,
    setSettingsOpen,
    syncDebugOpen,
    setSyncDebugOpen,
    languageListOpen,
    setLanguageListOpen,
    importPreviewOpen,
    setImportPreviewOpen,
    pendingImport,
    setPendingImport,
    importSummary,
    setImportSummary,
    timerExpanded,
    setTimerExpanded,
  } = useWorkoutStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!settingsOpen) return;
    void (async () => {
      try {
        const key = await getPairingSecretPayload();
        setSyncMasterKey(key);
      } catch {
        setSyncMasterKey(null);
      }
    })();
  }, [settingsOpen]);

  useEffect(() => {
    if (!syncDebugOpen) return;
    void refreshSyncLogs();
  }, [refreshSyncLogs, syncDebugOpen]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      if (!syncState?.syncEnabled) return;
      if (
        syncHealth.status !== 'error' &&
        syncHealth.status !== 'waiting' &&
        syncHealth.reconnectAttempts <= 0
      ) {
        return;
      }

      void (async () => {
        try {
          await refreshSyncState();
          await refreshSyncLogs();
          const key = syncMasterKey ?? (await getPairingSecretPayload());
          setSyncMasterKey(key);
          await stopSync();
          await startSync(syncState.syncRole ?? 'creator', key);
        } catch {
          // Ignore foreground reconnect nudges; the backend watchdog continues retrying.
        }
      })();
    });

    return () => {
      sub.remove();
    };
  }, [
    refreshSyncLogs,
    refreshSyncState,
    startSync,
    stopSync,
    syncHealth.reconnectAttempts,
    syncHealth.status,
    syncMasterKey,
    syncState?.syncEnabled,
    syncState?.syncRole,
  ]);

  useEffect(() => {
    const preferred = snapshot?.language ?? 'system';
    const effective = preferred === 'system' ? systemLanguage : preferred;
    if (effective && effective !== i18n.language) {
      i18n.changeLanguage(effective);
    }
  }, [snapshot?.language, systemLanguage]);

  const systemThemeMode: ThemeMode | null =
    systemScheme === 'dark' || systemScheme === 'light' ? systemScheme : null;
  const themePreference: ThemePreference = snapshot?.themeMode ?? 'system';
  const effectiveThemeMode = resolveThemeMode(themePreference, systemThemeMode);
  const tokens = useMemo(
    () => getThemeTokens(effectiveThemeMode, { enableDynamicColor: false }),
    [effectiveThemeMode],
  );

  const currentWeek = snapshot?.currentWeek ?? 1;
  const workouts = snapshot?.workouts ?? [];
  const userWeights = snapshot?.userWeights ?? {};
  const weekConfigs = snapshot?.weekConfigs ?? [];
  const dayConfigs = snapshot?.dayConfigs ?? defaultDayConfigs;
  const rawSelectedDay =
    snapshot?.currentDay ??
    dayConfigs[0]?.id ??
    defaultDayConfigs[0]?.id ??
    'push';
  const selectedDay = dayConfigs.some((day) => day.id === rawSelectedDay)
    ? rawSelectedDay
    : (dayConfigs[0]?.id ?? rawSelectedDay);
  const currentDay = selectedDay;
  const restDuration = snapshot?.restDuration ?? 150;
  const weightUnit: WeightUnit = snapshot?.weightUnit ?? 'kg';
  const currentLanguage = snapshot?.language ?? 'system';

  const exerciseBaseWeights = useMemo(() => {
    const map = new Map<string, number>();
    for (const workout of workouts) {
      for (const exercise of workout.exercises) {
        map.set(exercise.id, exercise.baseWeight);
      }
    }
    return map;
  }, [workouts]);

  const layout = useMemo(() => {
    const navBottomPadding =
      Math.max(insets.bottom, responsiveLayout.isTablet ? 4 : 8) +
      (responsiveLayout.isTablet ? 4 : tokens.spacing.sm);
    const navHeight = (responsiveLayout.isTablet ? 54 : 64) + navBottomPadding;
    const floatingBottom = navHeight + 8;
    return {
      navBottomPadding,
      navHeight,
      timerFabBottom: floatingBottom + 8,
      timerPanelBottom: floatingBottom,
      workoutFabBottom: floatingBottom + 8,
      contentBottomPadding: floatingBottom + 96,
    };
  }, [insets.bottom, responsiveLayout.isTablet, tokens.spacing.sm]);

  const currentWorkout = useMemo(() => {
    const match = workouts.find((workout) => workout.id === currentDay);
    if (match) return match;
    const fallbackName =
      dayConfigs.find((day) => day.id === currentDay)?.name ?? 'Workout';
    return {
      id: currentDay,
      name: fallbackName,
      description: '',
      exercises: [],
    };
  }, [workouts, currentDay, dayConfigs]);

  const localSyncSummary = useMemo(() => {
    if (!snapshot) return null;
    return summarizeRuntime(snapshot);
  }, [snapshot]);

  const workoutNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const workout of workouts) {
      map[workout.id] = workout.name;
    }
    return map;
  }, [workouts]);

  const exerciseNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const workout of workouts) {
      for (const exercise of workout.exercises) {
        map[exercise.id] = exercise.name;
      }
    }
    return map;
  }, [workouts]);

  const getWeek = (weekId?: number) =>
    weekConfigs.find((week) => week.id === (weekId ?? currentWeek)) ??
    weekConfigs[0];

  const getAdjustedWeight = (exerciseId: string, weekId?: number) => {
    const week = getWeek(weekId);
    const fallback = exerciseBaseWeights.get(exerciseId) ?? 0;
    const baseWeight = userWeights[exerciseId] ?? fallback;
    const rawKg = baseWeight * (week?.loadModifier ?? 1);
    if (weightUnit === 'lb') {
      const rawLb = toDisplayWeight(rawKg, 'lb');
      const roundedLb = roundToIncrement(rawLb, 2.5);
      return fromDisplayWeight(roundedLb, 'lb');
    }
    return roundToHalf(rawKg);
  };

  const handleOpenAdd = () => {
    setEditingExerciseId(null);
    setExerciseModalMode('add');
    setExerciseModalOpen(true);
  };

  const handleOpenEdit = (exercise: Exercise) => {
    setEditingExerciseId(exercise.id);
    setExerciseModalMode('edit');
    setExerciseModalOpen(true);
  };

  const handleExerciseSubmit = async (
    payload: Omit<Exercise, 'id' | 'position' | 'baseWeight'>,
  ) => {
    const editing = editingExerciseId
      ? currentWorkout.exercises.find((e) => e.id === editingExerciseId)
      : null;

    if (exerciseModalMode === 'edit' && editing) {
      await applyMutation({
        type: 'editExercise',
        workoutId: currentWorkout.id,
        exerciseId: editing.id,
        updates: payload,
      });
      return;
    }

    await applyMutation({
      type: 'addExercise',
      workoutId: currentWorkout.id,
      exercise: payload,
    });
  };

  const handleDeleteExercise = (exercise: Exercise) => {
    showPrompt(
      t('prompts.deleteExercise.title'),
      t('prompts.deleteExercise.message', {
        exercise: exercise.name,
        workout: currentWorkout.name,
      }),
      [
        { label: t('common.cancel'), tone: 'cancel' },
        {
          label: t('common.delete'),
          tone: 'destructive',
          onPress: () => {
            void applyMutation({
              type: 'deleteExercise',
              workoutId: currentWorkout.id,
              exerciseId: exercise.id,
            });
          },
        },
      ],
    );
  };

  const handleResetData = () => {
    showPrompt(
      t('prompts.resetAllData.title'),
      t('prompts.resetAllData.message'),
      [
        { label: t('common.cancel'), tone: 'cancel' },
        {
          label: t('prompts.resetAllData.actions.confirm'),
          tone: 'destructive',
          onPress: () => {
            setSettingsOpen(false);
            void (async () => {
              try {
                const enrolledLevel =
                  await LocalAuthentication.getEnrolledLevelAsync();
                if (enrolledLevel !== LocalAuthentication.SecurityLevel.NONE) {
                  const result = await LocalAuthentication.authenticateAsync({
                    promptMessage: t('prompts.resetAllData.authPromptMessage'),
                    cancelLabel: t('common.cancel'),
                    disableDeviceFallback: false,
                  });

                  if (!result.success) {
                    showPrompt(
                      t('prompts.resetAllData.canceledTitle'),
                      t('prompts.resetAllData.canceledMessage'),
                    );
                    return;
                  }
                }
                await applyMutation({ type: 'resetAllData' });
              } catch (error) {
                logError('reset/authentication failed', error);
                showPrompt(
                  t('prompts.resetAllData.failedTitle'),
                  getErrorMessage(error),
                );
              }
            })();
          },
        },
      ],
    );
  };

  const exportBackup = async (mode: 'share' | 'save') => {
    if (!snapshot) return;
    try {
      const fileName = getBackupFileName();
      const payload = serializePwaBackupV2(snapshot);

      if (mode === 'save') {
        const permissions =
          await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) {
          logError('backup/export save canceled', {
            reason: 'directory-permission-denied',
          });
          return;
        }

        const targetUri = await StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          fileName,
          'application/json',
        );

        await writeAsStringAsync(targetUri, payload, {
          encoding: EncodingType.UTF8,
        });

        showPrompt(
          t('prompts.exportBackup.savedTitle'),
          t('prompts.exportBackup.savedMessage', { fileName }),
        );
      } else {
        const file = new File(Paths.cache, fileName);
        file.create({ overwrite: true, intermediates: true });
        file.write(payload, { encoding: 'utf8' });

        if (await Sharing.isAvailableAsync()) {
          try {
            await Sharing.shareAsync(file.uri, {
              mimeType: 'application/json',
              dialogTitle: t('prompts.exportBackup.chooserTitle'),
              UTI: 'public.json',
            });
          } catch (error) {
            const message = getErrorMessage(error).toLowerCase();
            if (!message.includes('cancel')) {
              logError('backup/export share failed', {
                mode,
                fileName,
                error: getErrorMessage(error),
              });
              throw error;
            }
            logError('backup/export share canceled', {
              mode,
              fileName,
            });
          }
        } else {
          logError('backup/export share unavailable', {
            mode,
            platform: 'android',
          });
          showPrompt(
            t('prompts.exportBackup.sharingUnavailableTitle'),
            t('prompts.exportBackup.sharingUnavailableMessage'),
          );
        }
      }
    } catch (error) {
      logError('backup/export failed', error);
      showPrompt(t('prompts.exportBackup.failedTitle'), getErrorMessage(error));
    }
  };

  const handleImportBackup = async () => {
    if (!snapshot) return;
    try {
      const picked = await File.pickFileAsync(undefined, 'application/json');
      const pickedFile = Array.isArray(picked) ? picked[0] : picked;
      if (!pickedFile) return;

      const fileText = await pickedFile.text();
      void beginImportFromPayload(fileText);
    } catch (error) {
      const message = getErrorMessage(error).toLowerCase();
      if (message.includes('cancel')) return;
      logError('backup/import failed', error);
      showPrompt(t('prompts.importBackup.failedTitle'), getErrorMessage(error));
    }
  };

  const handleOpenLocalBackup = () => {
    setBackupActionMode('local');
  };

  const handleOpenQRBackup = () => {
    setBackupActionMode('qr');
  };

  const beginImportFromPayload = async (payload: string) => {
    if (!snapshot) return false;
    try {
      let decodedPayload = payload;
      const qrDecoded = decodeQrPayload(payload);
      if (qrDecoded.kind === 'single') {
        decodedPayload = assembleChunkedPackets(
          new Map([[0, qrDecoded.payload]]),
          1,
          qrDecoded.checksum,
        );
      } else if (qrDecoded.kind === 'chunk') {
        decodedPayload = assembleChunkedPackets(
          new Map([[qrDecoded.index, qrDecoded.payload]]),
          qrDecoded.total,
          qrDecoded.checksum,
        );
      } else {
        decodedPayload = qrDecoded.payload;
      }

      const migrated = parseAndMigrateBackup(decodedPayload);
      const summary = computeImportDiff(
        toPwaBackupV2(snapshot),
        migrated.backup,
      );

      setPendingImport(migrated);
      setImportSummary(summary);
      setImportPreviewOpen(true);
      return true;
    } catch (error) {
      logError('backup/import from payload failed', error);
      showPrompt(t('prompts.importBackup.failedTitle'), getErrorMessage(error));
      return false;
    }
  };

  const handleScanPayload = async (payload: string) => {
    return beginImportFromPayload(payload);
  };

  const handleConfirmImport = async () => {
    if (!pendingImport) return;
    try {
      await applyMutation({
        type: 'restoreRuntimeState',
        runtime: pendingImport.runtime,
        source: 'local-import',
      });
      setImportPreviewOpen(false);
      setPendingImport(null);
    } catch (error) {
      logError('backup/import confirm failed', error);
      showPrompt(t('prompts.importBackup.failedTitle'), getErrorMessage(error));
    }
  };

  const handleCancelImport = () => {
    setImportPreviewOpen(false);
    setPendingImport(null);
  };

  const handleReorderExercises = (orderedExerciseIds: string[]) => {
    void applyMutation({
      type: 'reorderExercises',
      workoutId: currentWorkout.id,
      orderedExerciseIds,
    });
  };

  const finishOnboarding = async () => {
    if (repository) {
      await repository.markSetupDone();
    }
    await reload();
  };

  const handleOpenGithub = async () => {
    const repoUrl = APP_CONFIG.githubRepoUrl;
    try {
      const canOpen = await Linking.canOpenURL(repoUrl);
      if (!canOpen) {
        showPrompt(t('prompts.openLink.cannotOpenLinkTitle'), repoUrl);
        return;
      }
      await Linking.openURL(repoUrl);
    } catch (error) {
      showPrompt(
        t('prompts.openLink.cannotOpenLinkTitle'),
        getErrorMessage(error),
      );
    }
  };

  const handleWeekChange = (nextWeek: number) => {
    void applyMutation({ type: 'setCurrentWeek', currentWeek: nextWeek });
  };

  const handleDayChange = (nextDay: WorkoutDay) => {
    if (nextDay === selectedDay) return;
    void applyMutation({ type: 'setCurrentDay', currentDay: nextDay });
  };

  const handleRestDurationChange = (nextDuration: number) => {
    void applyMutation({ type: 'setRestDuration', restDuration: nextDuration });
  };

  const handleThemeModeChange = (nextTheme: ThemePreference) => {
    void applyMutation({ type: 'setThemeMode', themeMode: nextTheme });
  };

  const handleWeightUnitChange = (nextUnit: WeightUnit) => {
    void applyMutation({ type: 'setWeightUnit', weightUnit: nextUnit });
  };

  const handleLanguageChange = (nextLanguage: string) => {
    if (nextLanguage === 'system') {
      i18n.changeLanguage(systemLanguage);
      void applyMutation({ type: 'setLanguage', language: 'system' });
      return;
    }

    i18n.changeLanguage(nextLanguage);
    void applyMutation({ type: 'setLanguage', language: nextLanguage });
  };

  const handleAdjustWeight = (exerciseId: string, delta: number) => {
    void applyMutation({ type: 'adjustExerciseWeight', exerciseId, delta });
  };

  const handleSetWeight = (exerciseId: string, value: number) => {
    void applyMutation({ type: 'setExerciseWeight', exerciseId, value });
  };

  const handleToggleSync = async (nextEnabled: boolean) => {
    if (nextEnabled) {
      const existingKey = syncMasterKey ?? (await getPairingSecretPayload());
      const role = syncState?.syncRole;
      setSyncMasterKey(existingKey);

      if (!role) {
        await handleOpenCreateRoom();
        return;
      }

      if (role === 'joiner' && !existingKey.trim()) {
        setJoinRoomOpen(true);
        return;
      }

      await startSync(role, existingKey);
      return;
    }
    await stopSync();
  };

  const handleApplyMasterKey = async (nextKey: string) => {
    const normalized = nextKey.trim().toLowerCase();
    if (!repository) {
      throw new Error('Sync storage is not ready yet.');
    }

    const wasActive = syncState?.syncEnabled ?? false;
    if (wasActive) {
      await stopSync();
    }
    await repository.clearSyncPeerHistory();
    await setPairingSecretPayload(normalized);
    await repository.setSyncState({ autobaseBootstrapKey: null });
    setSyncMasterKey(normalized);
    await refreshSyncState();
    if (wasActive) {
      await startSync(syncState?.syncRole ?? 'joiner', normalized);
    }
  };

  const handleCopyMasterKey = async () => {
    const key = syncMasterKey ?? (await getPairingSecretPayload());
    setSyncMasterKey(key);
    await Clipboard.setStringAsync(key);
  };

  const handleRefreshSync = async () => {
    await refreshSyncState();
    await refreshSyncLogs();
    try {
      const key = await getPairingSecretPayload();
      setSyncMasterKey(key);
    } catch {
      setSyncMasterKey(null);
    }
  };

  const startCreatorRoom = async (forcedKey?: string) => {
    if (!repository) {
      throw new Error('Sync storage is not ready yet.');
    }

    const wasActive = syncState?.syncEnabled ?? false;
    if (wasActive) {
      await stopSync();
    }

    const key = (
      forcedKey ??
      syncMasterKey ??
      (await getPairingSecretPayload())
    )
      .trim()
      .toLowerCase();
    await repository.clearSyncPeerHistory();
    await setPairingSecretPayload(key);
    setSyncMasterKey(key);
    await refreshSyncState();
    await startSync('creator', key);
    const nextSyncState = await repository.getSyncState();
    if (!nextSyncState.autobaseBootstrapKey) {
      throw new Error('Sync room bootstrap key was not created.');
    }
    setSyncRoomInvite(
      encodeSyncRoomInvite({
        pairingSecretHex: key,
        bootstrapKeyHex: nextSyncState.autobaseBootstrapKey,
      }),
    );
    setJoinRoomOpen(false);
  };

  const handleOpenCreateRoom = async () => {
    const key = syncMasterKey ?? (await getPairingSecretPayload());
    setSyncMasterKey(key);
    setSyncRoomInvite(null);
    setCreateRoomOpen(true);

    if (syncState?.autobaseBootstrapKey) {
      setSyncRoomInvite(
        encodeSyncRoomInvite({
          pairingSecretHex: key,
          bootstrapKeyHex: syncState.autobaseBootstrapKey,
        }),
      );
      return;
    }

    setCreateRoomStarting(true);
    try {
      await startCreatorRoom(key);
    } finally {
      setCreateRoomStarting(false);
    }
  };

  const handleJoinRoom = async (nextKey: string, showError = true) => {
    try {
      if (!repository) {
        throw new Error('Sync storage is not ready yet.');
      }

      const invite = decodeSyncRoomInvite(nextKey);
      const wasActive = syncState?.syncEnabled ?? false;
      if (wasActive) {
        await stopSync();
      }

      await repository.clearSyncPeerHistory();
      await setPairingSecretPayload(invite.pairingSecretHex);
      setSyncMasterKey(invite.pairingSecretHex);
      await repository.setSyncState({
        autobaseBootstrapKey: invite.bootstrapKeyHex,
      });
      await refreshSyncState();
      await startSync(
        'joiner',
        invite.pairingSecretHex,
        invite.bootstrapKeyHex,
      );
      setJoinRoomOpen(false);
      setJoinRoomScanOpen(false);
      setCreateRoomOpen(false);
      return true;
    } catch (error) {
      if (showError) {
        showPrompt(t('sync.join.invalidKey'), getErrorMessage(error));
      }
      return false;
    }
  };

  const handleResolveFirstSyncDecision = async (
    choice: 'local_chosen' | 'remote_chosen' | 'merge_chosen',
  ) => {
    await resolveFirstSyncChoice(choice);
  };

  const handleForgetPairedDevice = async (deviceId: string) => {
    showPrompt(
      t('sync.manage.removeDeviceConfirmTitle'),
      t('sync.manage.removeDeviceConfirmMessage'),
      [
        { label: t('common.cancel'), tone: 'cancel' },
        {
          label: t('sync.manage.removeDevice'),
          tone: 'destructive',
          onPress: () => {
            void forgetPairedDevice(deviceId);
          },
        },
      ],
    );
  };

  const handleLeaveSyncRoom = async () => {
    showPrompt(
      t('sync.manage.leaveRoomConfirmTitle'),
      t('sync.manage.leaveRoomConfirmMessage'),
      [
        { label: t('common.cancel'), tone: 'cancel' },
        {
          label: t('sync.manage.leaveRoom'),
          tone: 'destructive',
          onPress: () => {
            void leaveSyncRoom();
          },
        },
      ],
    );
  };

  const handleShowSyncQRCode = async () => {
    if (!syncState?.autobaseBootstrapKey) return;
    const key = syncMasterKey ?? (await getPairingSecretPayload());
    setSyncMasterKey(key);
    setSyncRoomInvite(
      encodeSyncRoomInvite({
        pairingSecretHex: key,
        bootstrapKeyHex: syncState.autobaseBootstrapKey,
      }),
    );
    setCreateRoomOpen(true);
  };

  const handleOnboardingOpenCreate = () => {
    void handleOpenCreateRoom();
  };

  const handleOnboardingOpenJoin = () => {
    setJoinRoomOpen(true);
  };

  const onboardingBlocking = snapshot?.isSetupDone === false;

  const sharedSyncModals = (
    <>
      <SyncCreateRoomModal
        open={createRoomOpen}
        tokens={tokens}
        topInset={insets.top}
        bottomInset={insets.bottom}
        invitePayload={syncRoomInvite}
        isStarting={createRoomStarting}
        localSummary={localSyncSummary}
        onClose={() => setCreateRoomOpen(false)}
      />

      <SyncJoinRoomModal
        open={joinRoomOpen}
        tokens={tokens}
        topInset={insets.top}
        bottomInset={insets.bottom}
        localSummary={localSyncSummary}
        onJoinRoom={handleJoinRoom}
        onScanRoomKey={() => setJoinRoomScanOpen(true)}
        onClose={() => setJoinRoomOpen(false)}
      />

      <SyncRoomKeyScanModal
        open={joinRoomScanOpen}
        tokens={tokens}
        topInset={insets.top}
        bottomInset={insets.bottom}
        onScanPayload={(payload) => handleJoinRoom(payload, false)}
        onClose={() => setJoinRoomScanOpen(false)}
      />

      <SyncFirstDecisionModal
        open={
          syncState?.roomBindingState === 'conflict_requires_decision' ||
          syncState?.roomBindingState === 'active_conflict_requires_decision'
        }
        tokens={tokens}
        topInset={insets.top}
        bottomInset={insets.bottom}
        localSummary={syncState?.pendingLocalSummary ?? localSyncSummary}
        remoteSummary={syncState?.pendingRemoteSummary ?? null}
        conflictSummary={syncState?.pendingConflictSummary ?? null}
        workoutNameMap={workoutNameMap}
        exerciseNameMap={exerciseNameMap}
        onChooseLocal={() => handleResolveFirstSyncDecision('local_chosen')}
        onChooseRemote={() => handleResolveFirstSyncDecision('remote_chosen')}
        onChooseMerge={() => handleResolveFirstSyncDecision('merge_chosen')}
        onClose={() => {
          void handleRefreshSync();
        }}
      />
    </>
  );

  if (onboardingBlocking) {
    return (
      <>
        {sharedSyncModals}
        <SafeAreaView
          edges={['left', 'right']}
          style={[styles.safeArea, { backgroundColor: tokens.colors.bgBase }]}
        >
          <StatusBar
            style={effectiveThemeMode === 'dark' ? 'light' : 'dark'}
            backgroundColor={tokens.colors.bgBase}
            translucent={false}
          />
          <OnboardingScreen
            tokens={tokens}
            topInset={insets.top}
            bottomInset={insets.bottom}
            weightUnit={weightUnit}
            onWeightUnitChange={handleWeightUnitChange}
            onOpenSyncCreate={handleOnboardingOpenCreate}
            onOpenSyncJoin={handleOnboardingOpenJoin}
            onComplete={finishOnboarding}
          />
        </SafeAreaView>
      </>
    );
  }

  if (!isReady || !snapshot) {
    return (
      <SafeAreaView
        edges={['left', 'right']}
        style={[styles.safeArea, { backgroundColor: tokens.colors.bgBase }]}
      >
        <StatusBar
          style={effectiveThemeMode === 'dark' ? 'light' : 'dark'}
          backgroundColor={tokens.colors.bgBase}
          translucent={false}
        />
        <BootstrapScreen
          backgroundColor={tokens.colors.bgBase}
          accentColor={tokens.colors.primary}
          imageSource={require('../../assets/pearlift_transparent.png')}
          title={APP_CONFIG.name}
          subtitle="Welcome!"
          textPrimary={tokens.colors.textPrimary}
          textSecondary={tokens.colors.textSecondary}
        />
      </SafeAreaView>
    );
  }

  const editingExercise = editingExerciseId
    ? (currentWorkout.exercises.find((e) => e.id === editingExerciseId) ?? null)
    : null;

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[styles.safeArea, { backgroundColor: tokens.colors.bgBase }]}
    >
      <StatusBar
        style={effectiveThemeMode === 'dark' ? 'light' : 'dark'}
        backgroundColor={tokens.colors.bgBase}
        translucent={false}
      />
      <View style={styles.appShell}>
        <Header
          tokens={tokens}
          topInset={insets.top}
          maxWidth={responsiveLayout.contentMaxWidth}
          syncHealth={syncHealth}
          onOpenSettings={() => {
            setSettingsOpen(true);
          }}
          onOpenSyncQuickInfo={() => setSyncQuickInfoOpen(true)}
        />

        <WorkoutDayStack
          tokens={tokens}
          weightUnit={weightUnit}
          dayConfigs={dayConfigs}
          workouts={workouts}
          selectedDay={selectedDay}
          currentWeek={currentWeek}
          weekConfigs={weekConfigs}
          userWeights={userWeights}
          getAdjustedWeight={getAdjustedWeight}
          onWeekChange={handleWeekChange}
          onOpenProgramSettings={() => setProgramSettingsOpen(true)}
          onOpenAddExercise={handleOpenAdd}
          onEditExercise={handleOpenEdit}
          onDeleteExercise={handleDeleteExercise}
          onAdjustWeight={handleAdjustWeight}
          onSetWeight={handleSetWeight}
          onReorderExercises={handleReorderExercises}
          contentBottomPadding={
            layout.contentBottomPadding + (timerExpanded ? 260 : 0)
          }
          fabBottom={layout.workoutFabBottom}
          contentMaxWidth={responsiveLayout.contentMaxWidth}
          exerciseColumns={responsiveLayout.exerciseColumns}
        />

        <RestTimer
          tokens={tokens}
          duration={restDuration}
          onDurationChange={handleRestDurationChange}
          fabBottom={layout.timerFabBottom}
          panelBottom={layout.timerPanelBottom}
          onExpandedChange={setTimerExpanded}
        />

        <Navigation
          tokens={tokens}
          currentDay={selectedDay}
          dayConfigs={dayConfigs}
          onDayChange={handleDayChange}
          bottomPadding={layout.navBottomPadding}
          minHeight={layout.navHeight}
        />

        <AddExerciseModal
          open={exerciseModalOpen}
          mode={exerciseModalMode}
          tokens={tokens}
          initialExercise={editingExercise}
          onClose={() => setExerciseModalOpen(false)}
          onSubmit={(payload) => {
            void handleExerciseSubmit(payload);
          }}
        />

        <ProgramSettingsModal
          open={programSettingsOpen}
          tokens={tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          weekConfigs={weekConfigs}
          dayConfigs={dayConfigs}
          onClose={() => setProgramSettingsOpen(false)}
          onWeekConfigsChange={(nextWeekConfigs) => {
            void applyMutation({
              type: 'replaceWeekConfigs',
              weekConfigs: nextWeekConfigs,
            });
          }}
          onDayConfigsChange={(nextDayConfigs) => {
            void applyMutation({
              type: 'replaceDayConfigs',
              dayConfigs: nextDayConfigs,
            });
          }}
          onPrompt={showPrompt}
        />

        <ImportPreviewModal
          open={importPreviewOpen}
          tokens={tokens}
          summary={importSummary}
          onClose={handleCancelImport}
          onConfirm={() => {
            void handleConfirmImport();
          }}
        />

        <SettingsModal
          open={settingsOpen}
          tokens={tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          appName={APP_CONFIG.name}
          appVersion={APP_CONFIG.version}
          appBuild={APP_CONFIG.buildNumber ?? 'N/A'}
          buildType={APP_CONFIG.buildType}
          themePreference={themePreference}
          systemThemeMode={systemThemeMode}
          onThemePreferenceChange={handleThemeModeChange}
          weightUnit={weightUnit}
          onWeightUnitChange={handleWeightUnitChange}
          language={currentLanguage}
          onLanguageChange={handleLanguageChange}
          onLanguageListOpen={() => setLanguageListOpen(true)}
          syncState={syncState}
          syncHealth={syncHealth}
          pairedDevices={pairedDevices}
          localDeviceDisplayName={localDeviceDisplayName}
          masterKey={syncMasterKey}
          onToggleSync={handleToggleSync}
          onOpenCreateRoom={() => {
            void handleOpenCreateRoom();
          }}
          onOpenJoinRoom={() => setJoinRoomOpen(true)}
          onShowSyncQR={() => void handleShowSyncQRCode()}
          onApplyMasterKey={handleApplyMasterKey}
          onRenameLocalDevice={renameLocalDevice}
          onCopyMasterKey={handleCopyMasterKey}
          onForgetDevice={handleForgetPairedDevice}
          onLeaveRoom={handleLeaveSyncRoom}
          onOpenDebug={() => {
            setSyncDebugOpen(true);
          }}
          onOpenLocalBackup={handleOpenLocalBackup}
          onOpenQRBackup={handleOpenQRBackup}
          onResetData={handleResetData}
          onClose={() => {
            setSettingsOpen(false);
            setSettingsSyncExpanded(false);
          }}
          onOpenGithub={handleOpenGithub}
          defaultSyncExpanded={settingsSyncExpanded}
        />

        <SyncQuickInfoModal
          open={syncQuickInfoOpen}
          tokens={tokens}
          syncHealth={syncHealth}
          onMore={() => {
            setSyncQuickInfoOpen(false);
            setSettingsSyncExpanded(true);
            setSettingsOpen(true);
          }}
          onClose={() => {
            setSyncQuickInfoOpen(false);
          }}
        />

        {sharedSyncModals}

        <SyncDebugInfoModal
          open={syncDebugOpen}
          tokens={tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          syncHealth={syncHealth}
          logEntries={syncLogs}
          onRefresh={handleRefreshSync}
          onClearLogs={() => {
            clearRecentLogs();
            void refreshSyncLogs();
          }}
          onClose={() => {
            setSyncDebugOpen(false);
          }}
        />

        <ShareToDeviceModal
          open={shareToDeviceOpen}
          tokens={tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          runtimeState={snapshot}
          onClose={() => setShareToDeviceOpen(false)}
        />

        <ScanFromDeviceModal
          open={scanFromDeviceOpen}
          tokens={tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          onScanPayload={handleScanPayload}
          onClose={() => setScanFromDeviceOpen(false)}
        />

        <BackupActionModal
          open={backupActionMode != null}
          mode={backupActionMode}
          tokens={tokens}
          onExportLocalBackup={() => void exportBackup('save')}
          onImportLocalBackup={() => void handleImportBackup()}
          onShareBackup={() => void exportBackup('share')}
          onShareToDevice={() => setShareToDeviceOpen(true)}
          onScanFromDevice={() => setScanFromDeviceOpen(true)}
          onClose={() => setBackupActionMode(null)}
        />

        <LanguageListModal
          open={languageListOpen}
          tokens={tokens}
          selectedLanguage={currentLanguage}
          onClose={() => {
            setLanguageListOpen(false);
          }}
          onSelectLanguage={(code) => {
            handleLanguageChange(code);
          }}
        />

        <AppPromptModal
          open={Boolean(promptConfig)}
          tokens={tokens}
          title={promptConfig?.title ?? ''}
          message={promptConfig?.message ?? ''}
          actions={promptConfig?.actions ?? [{ label: 'OK' }]}
          onClose={closePrompt}
        />
      </View>
    </SafeAreaView>
  );
}
