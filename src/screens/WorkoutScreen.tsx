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
import { Linking, Platform, useColorScheme, View } from 'react-native';
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
} from '../backup/localBackup';
import { BootstrapScreen } from '../components/BootstrapScreen';
import { Header } from '../components/Header';
import { AddExerciseModal } from '../components/modals/AddExerciseModal';
import { AppPromptModal } from '../components/modals/AppPromptModal';
import { ImportPreviewModal } from '../components/modals/ImportPreviewModal';
import { LanguageListModal } from '../components/modals/LanguageListModal';
import { PairedDevicesModal } from '../components/modals/PairedDevicesModal';
import { ProgramSettingsModal } from '../components/modals/ProgramSettingsModal';
import { SettingsModal } from '../components/modals/SettingsModal';
import { SyncPairNewDeviceModal } from '../components/modals/SyncPairNewDeviceModal';
import { SyncQuickStatusModal } from '../components/modals/SyncQuickStatusModal';
import { SyncSetupModal } from '../components/modals/SyncSetupModal';
import { Navigation } from '../components/Navigation';
import { OnboardingScreen } from '../components/OnboardingScreen';
import { RestTimer } from '../components/RestTimer';
import { WorkoutDayStack } from '../components/WorkoutDayStack';
import { APP_CONFIG } from '../config/app';
import { defaultDayConfigs } from '../data/workouts';
import i18n, { SUPPORTED_I18N_LANGUAGE_CODES } from '../i18n';
import { useSystemLanguage } from '../i18n/systemLanguage';
import { useWorkoutStore } from '../store/workoutStore';
import type { SyncLogEntry } from '../sync/logger';
import { logSyncEvent } from '../sync/logger';
import {
  clearPairingSecret,
  getPairingSecretPayload,
} from '../sync/syncManager';
import type { ThemeMode, ThemePreference } from '../theme/tokens';
import { getThemeTokens, resolveThemeMode } from '../theme/tokens';
import type { Exercise, WeightUnit, WorkoutDay } from '../types';
import { getErrorMessage, logError } from '../utils/errors';
import { roundToHalf } from '../utils/math';
import {
  fromDisplayWeight,
  roundToIncrement,
  toDisplayWeight,
} from '../utils/units';
import { styles } from './styles';

export function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const systemScheme = useColorScheme();
  const systemLanguage = useSystemLanguage(SUPPORTED_I18N_LANGUAGE_CODES, 'en');
  const { t } = useTranslation();

  const [pairNewDeviceOpen, setPairNewDeviceOpen] = useState(false);
  const [pairedDevicesOpen, setPairedDevicesOpen] = useState(false);
  const [syncQuickStatusOpen, setSyncQuickStatusOpen] = useState(false);
  const [settingsSyncHubOpen, setSettingsSyncHubOpen] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);

  const {
    snapshot,
    isReady,
    repository,
    applyMutation,
    reload,
    initialize,
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
    syncStatus,
    syncPeers,
    syncConnections,
    syncPeerKeys,
    syncLocalWriterKey,
    syncAutobaseKey,
    syncTopicHex,
    syncBootstrapped,
    syncReconnectAttempts,
    syncManager,
    localDeviceId,
    lastSyncedAt,
    syncError,
    startSync,
    stopSync,
    pairedDevices,
    syncSecret,
    loadPairedDevices,
    forgetDevice,
    setSyncSecret,
    setSyncSetupOpen,
    syncSetupOpen,
    newPeerSignal,
    acknowledgeNewPeerSignal,
  } = useWorkoutStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

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
    const navBottomPadding = Math.max(insets.bottom, 8) + tokens.spacing.sm;
    const navHeight = 64 + navBottomPadding;
    const floatingBottom = navHeight + 8;
    return {
      navBottomPadding,
      navHeight,
      timerFabBottom: floatingBottom + 8,
      timerPanelBottom: floatingBottom,
      workoutFabBottom: floatingBottom + 8,
      contentBottomPadding: floatingBottom + 96,
    };
  }, [insets.bottom, tokens.spacing.sm]);

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

                try {
                  await stopSync();
                } catch (error) {
                  logError('sync/stop before reset failed', error);
                }

                try {
                  await clearPairingSecret();
                } catch (error) {
                  logError('sync/clear pairing secret failed', error);
                }

                setSyncSecret(null);
                await applyMutation({ type: 'resetAllData' });
                await loadPairedDevices();
                const nextSecret = await getPairingSecretPayload();
                setSyncSecret(nextSecret);
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

      if (mode === 'save' && Platform.OS === 'android') {
        const permissions =
          await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) {
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
              throw error;
            }
          }
        } else {
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

  const handleExportBackup = () => {
    if (!snapshot) return;

    if (Platform.OS === 'android') {
      showPrompt(
        t('prompts.exportBackup.chooserTitle'),
        t('prompts.exportBackup.chooserMessage'),
        [
          {
            label: t('prompts.exportBackup.actions.saveToDevice'),
            onPress: () => void exportBackup('save'),
          },
          {
            label: t('prompts.exportBackup.actions.share'),
            onPress: () => void exportBackup('share'),
          },
          { label: t('common.cancel'), tone: 'cancel' },
        ],
      );
      return;
    }

    void exportBackup('share');
  };

  const handleImportBackup = async () => {
    if (!snapshot) return;
    try {
      const picked = await File.pickFileAsync(undefined, 'application/json');
      const pickedFile = Array.isArray(picked) ? picked[0] : picked;
      if (!pickedFile) return;

      const fileText = await pickedFile.text();
      const migrated = parseAndMigrateBackup(fileText);
      const summary = computeImportDiff(
        toPwaBackupV2(snapshot),
        migrated.backup,
      );

      setPendingImport(migrated);
      setImportSummary(summary);
      setImportPreviewOpen(true);
    } catch (error) {
      const message = getErrorMessage(error).toLowerCase();
      if (message.includes('cancel')) return;
      logError('backup/import failed', error);
      showPrompt(t('prompts.importBackup.failedTitle'), getErrorMessage(error));
    }
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

  useEffect(() => {
    if (!newPeerSignal) return;
    showPrompt(t('sync.toast.newPeerTitle'), t('sync.toast.newPeerMessage'));
    acknowledgeNewPeerSignal();
  }, [newPeerSignal, showPrompt, t, acknowledgeNewPeerSignal]);

  const authenticateIfAvailable = async (promptMessage: string) => {
    const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();
    if (enrolledLevel === LocalAuthentication.SecurityLevel.NONE) {
      return true;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: t('common.cancel'),
      disableDeviceFallback: false,
    });
    return result.success;
  };

  const handleOpenPairNewDevice = () => {
    showPrompt(
      t('prompts.pairNewDevice.title'),
      t('prompts.pairNewDevice.message'),
      [
        { label: t('common.cancel'), tone: 'cancel' },
        {
          label: t('common.ok'),
          onPress: () => {
            void (async () => {
              try {
                const ok = await authenticateIfAvailable(
                  t('prompts.pairNewDevice.authPromptMessage'),
                );
                if (!ok) {
                  showPrompt(
                    t('prompts.pairNewDevice.canceledTitle'),
                    t('prompts.pairNewDevice.canceledMessage'),
                  );
                  return;
                }
                logSyncEvent(
                  'info',
                  'ui',
                  'pair_new_device_requested',
                  'New pair request opened.',
                );
                setPairNewDeviceOpen(true);
              } catch (error) {
                logError('sync/pair/authentication failed', error);
                showPrompt(
                  t('prompts.pairNewDevice.failedTitle'),
                  getErrorMessage(error),
                );
              }
            })();
          },
        },
      ],
    );
  };

  const handleOpenPairedDevices = () => {
    setPairedDevicesOpen(true);
    void loadPairedDevices();
  };

  const handleForgetDevice = (deviceId: string) => {
    showPrompt(
      t('settings.syncBackup.forgetConfirmTitle'),
      t('settings.syncBackup.forgetConfirmMessage'),
      [
        { label: t('common.cancel'), tone: 'cancel' },
        {
          label: t('settings.syncBackup.forgetDevice'),
          tone: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const ok = await authenticateIfAvailable(
                  t('prompts.forgetDevice.authPromptMessage'),
                );
                if (!ok) {
                  showPrompt(
                    t('prompts.forgetDevice.canceledTitle'),
                    t('prompts.forgetDevice.canceledMessage'),
                  );
                  return;
                }
                await forgetDevice(deviceId);
              } catch (error) {
                logError('sync/forget/authentication failed', error);
                showPrompt(
                  t('prompts.forgetDevice.failedTitle'),
                  getErrorMessage(error),
                );
              }
            })();
          },
        },
      ],
    );
  };

  const handleOpenSyncSetup = () => {
    setSettingsOpen(false);
    setSettingsSyncHubOpen(false);
    setSyncQuickStatusOpen(false);
    setSyncSetupOpen(true);
  };

  const refreshSyncLogs = () => {
    if (!syncManager) return;
    void syncManager.getAllLogs().then((entries) => setSyncLogs(entries));
  };

  const openSettingsSyncHub = () => {
    setSyncQuickStatusOpen(false);
    setSettingsOpen(true);
    setSettingsSyncHubOpen(true);
    refreshSyncLogs();
  };

  const handleToggleSync = () => {
    if (syncStatus === 'idle' || syncStatus === 'error') {
      handleOpenSyncSetup();
      return;
    }
    void stopSync();
  };

  const onboardingBlocking = snapshot?.isSetupDone === false;

  if (onboardingBlocking) {
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
        <OnboardingScreen
          tokens={tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          weightUnit={weightUnit}
          onWeightUnitChange={handleWeightUnitChange}
          syncStatus={syncStatus}
          lastSyncedAt={lastSyncedAt}
          syncError={syncError}
          onStartSync={startSync}
          onStopSync={stopSync}
          onComplete={finishOnboarding}
        />
      </SafeAreaView>
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
          syncStatus={syncStatus}
          syncPeers={syncPeers}
          onOpenSyncQuickStatus={() => setSyncQuickStatusOpen(true)}
          onOpenSettings={() => {
            setSettingsSyncHubOpen(false);
            setSettingsOpen(true);
          }}
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
          syncStatus={syncStatus}
          syncPeers={syncPeers}
          syncConnections={syncConnections}
          syncPeerKeys={syncPeerKeys}
          syncLocalWriterKey={syncLocalWriterKey}
          syncAutobaseKey={syncAutobaseKey}
          syncTopicHex={syncTopicHex}
          syncBootstrapped={syncBootstrapped}
          syncReconnectAttempts={syncReconnectAttempts}
          localDeviceId={localDeviceId}
          syncLogs={syncLogs}
          onRefreshSyncLogs={refreshSyncLogs}
          lastSyncedAt={lastSyncedAt}
          syncError={syncError}
          pairedDevices={pairedDevices}
          onToggleSync={handleToggleSync}
          onOpenSyncSetup={handleOpenSyncSetup}
          onOpenPairNewDevice={handleOpenPairNewDevice}
          onOpenPairedDevices={handleOpenPairedDevices}
          syncHubOpen={settingsSyncHubOpen}
          onSyncHubOpenChange={setSettingsSyncHubOpen}
          onExportLocalBackup={handleExportBackup}
          onImportLocalBackup={() => void handleImportBackup()}
          onResetData={handleResetData}
          onClose={() => {
            setSettingsSyncHubOpen(false);
            setSettingsOpen(false);
          }}
          onOpenGithub={handleOpenGithub}
        />

        <SyncQuickStatusModal
          open={syncQuickStatusOpen}
          tokens={tokens}
          syncStatus={syncStatus}
          syncPeers={syncPeers}
          lastSyncedAt={lastSyncedAt}
          syncError={syncError}
          onOpenSyncSetup={handleOpenSyncSetup}
          onOpenPairNewDevice={handleOpenPairNewDevice}
          onOpenPairedDevices={handleOpenPairedDevices}
          onOpenSyncHub={openSettingsSyncHub}
          onStopSync={() => {
            void stopSync();
          }}
          onClose={() => setSyncQuickStatusOpen(false)}
        />

        <SyncPairNewDeviceModal
          open={pairNewDeviceOpen}
          tokens={tokens}
          syncPeers={syncPeers}
          lastSyncedAt={lastSyncedAt}
          syncSecret={syncSecret}
          onClose={() => setPairNewDeviceOpen(false)}
        />

        <PairedDevicesModal
          open={pairedDevicesOpen}
          tokens={tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          pairedDevices={pairedDevices}
          onForgetDevice={handleForgetDevice}
          onClose={() => setPairedDevicesOpen(false)}
        />

        <SyncSetupModal
          open={syncSetupOpen}
          tokens={tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          syncStatus={syncStatus}
          lastSyncedAt={lastSyncedAt}
          syncPeers={syncPeers}
          syncError={syncError}
          syncBootstrapKey={syncAutobaseKey}
          onStartSync={startSync}
          onStopSync={stopSync}
          onClose={() => setSyncSetupOpen(false)}
          onDone={() => setSyncSetupOpen(false)}
          onViewInfo={() => {
            setSyncSetupOpen(false);
            openSettingsSyncHub();
          }}
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
