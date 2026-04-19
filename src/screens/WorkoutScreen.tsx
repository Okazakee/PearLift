import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
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
import type { ChangeSummary, MigratedBackupResult } from '../backup/types';
import { AddExerciseModal } from '../components/AddExerciseModal';
import { Header } from '../components/Header';
import { ImportPreviewModal } from '../components/ImportPreviewModal';
import { LocalBackupModal } from '../components/LocalBackupModal';
import { Navigation } from '../components/Navigation';
import { OnboardingScreen } from '../components/OnboardingScreen';
import { ProgramSettingsModal } from '../components/ProgramSettingsModal';
import { RestTimer } from '../components/RestTimer';
import { SettingsScreen } from '../components/SettingsScreen';
import { SyncSetupScreen } from '../components/SyncSetupScreen';
import { WorkoutView } from '../components/WorkoutView';
import { APP_CONFIG } from '../config/app';
import { defaultDayConfigs } from '../data/workouts';
import type { SyncMode } from '../storage/types';
import { useWorkoutStore } from '../storage/useWorkoutStore';
import { WorkoutRepository } from '../storage/workoutRepository';
import { IdentityService } from '../sync/identityService';
import type { SetupStatus, SyncStatus } from '../sync/types';
import type { ThemeMode, ThemePreference } from '../theme/tokens';
import { getThemeTokens, resolveThemeMode } from '../theme/tokens';
import type { Exercise } from '../types';

function roundToHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

function logError(scope: string, error: unknown) {
  // eslint-disable-next-line no-console
  console.error(`[${scope}]`, error);
}

function formatSyncSummary(status: SyncStatus | null) {
  if (!status) {
    return 'Preparing sync status.';
  }

  if (status.syncMode === 'local-only') {
    return 'Local-only mode active. Data stored on this device.';
  }

  if (status.syncMode === 'd2d-sync') {
    return 'Device-to-Device sync active.';
  }

  if (!status.lastBackupAt) {
    return `No backup yet. ${status.pendingChanges} pending change(s).`;
  }

  const pieces = [`Last backup: ${status.lastBackupAt}`];
  if (status.pendingChanges > 0) {
    pieces.push(`${status.pendingChanges} local change(s) not backed up yet`);
  }
  if (status.lastRestoreAt) {
    pieces.push(`last restore: ${status.lastRestoreAt}`);
  }
  return pieces.join(' - ');
}

export function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const systemScheme = useColorScheme();
  const [repository, setRepository] = useState<WorkoutRepository | null>(null);
  const [exerciseModalOpen, setExerciseModalOpen] = useState(false);
  const [exerciseModalMode, setExerciseModalMode] = useState<'add' | 'edit'>(
    'add',
  );
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [programSettingsOpen, setProgramSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localBackupOpen, setLocalBackupOpen] = useState(false);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [pendingImport, setPendingImport] =
    useState<MigratedBackupResult | null>(null);
  const [importSummary, setImportSummary] = useState<ChangeSummary>({
    workouts: [],
    settings: [],
    totalChanges: 0,
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncSetupOpen, setSyncSetupOpen] = useState(false);
  const [syncSetupBusy, setSyncSetupBusy] = useState(false);
  const [syncSetupError, setSyncSetupError] = useState<string | null>(null);
  const [timerExpanded, setTimerExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const identityService = new IdentityService();

    identityService
      .getOrCreateDeviceId()
      .then((deviceId) => {
        if (!cancelled) {
          setRepository(new WorkoutRepository(deviceId));
        }
      })
      .catch((error) => {
        logError('identity/device-id failed', error);
        Alert.alert('Setup unavailable', getErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const { snapshot, syncCoordinator, isReady, reload, applyMutation } =
    useWorkoutStore(repository);

  const themePreference: ThemePreference = snapshot?.themeMode ?? 'system';
  const systemThemeMode: ThemeMode | null =
    systemScheme === 'dark' || systemScheme === 'light' ? systemScheme : null;
  const effectiveThemeMode = resolveThemeMode(themePreference, systemThemeMode);
  const currentWeek = snapshot?.currentWeek ?? 1;
  const currentDay = snapshot?.currentDay ?? defaultDayConfigs[0]?.id ?? 'push';
  const workouts = snapshot?.workouts ?? [];
  const userWeights = snapshot?.userWeights ?? {};
  const weekConfigs = snapshot?.weekConfigs ?? [];
  const dayConfigs = snapshot?.dayConfigs ?? defaultDayConfigs;
  const restDuration = snapshot?.restDuration ?? 150;

  const tokens = useMemo(
    () => getThemeTokens(effectiveThemeMode, { enableDynamicColor: false }),
    [effectiveThemeMode],
  );
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
      contentBottomPadding: floatingBottom + (timerExpanded ? 360 : 96),
    };
  }, [insets.bottom, timerExpanded, tokens.spacing.sm]);

  const currentWorkout = useMemo(() => {
    return (
      workouts.find((workout) => workout.id === currentDay) ??
      workouts[0] ?? {
        id: 'push',
        name: 'Workout',
        description: '',
        exercises: [],
      }
    );
  }, [workouts, currentDay]);

  const refreshSyncStatus = useCallback(async () => {
    if (!syncCoordinator) {
      setSyncStatus(null);
      return;
    }
    try {
      const nextStatus = await syncCoordinator.getStatus();
      setSyncStatus(nextStatus);
    } catch (error) {
      logError('sync/status failed', error);
    }
  }, [syncCoordinator]);

  const refreshSetupStatus = useCallback(async () => {
    if (!syncCoordinator) {
      setSetupStatus(null);
      return;
    }
    try {
      const nextStatus = await syncCoordinator.getSetupStatus();
      setSetupStatus(nextStatus);
    } catch (error) {
      logError('sync/setup-status failed', error);
    }
  }, [syncCoordinator]);

  useEffect(() => {
    if (!syncCoordinator || !snapshot) {
      return;
    }
    void refreshSyncStatus();
    void refreshSetupStatus();
  }, [syncCoordinator, snapshot, refreshSyncStatus, refreshSetupStatus]);

  useEffect(() => {
    if (!localBackupOpen) {
      return;
    }
    void refreshSyncStatus();
  }, [localBackupOpen, refreshSyncStatus]);

  const runMutation = useCallback(
    async (mutation: Parameters<typeof applyMutation>[0]) => {
      await applyMutation(mutation);
      await refreshSyncStatus();
    },
    [applyMutation, refreshSyncStatus],
  );

  const getWeek = useCallback(
    (weekId?: number) =>
      weekConfigs.find((week) => week.id === (weekId ?? currentWeek)) ??
      weekConfigs[0],
    [currentWeek, weekConfigs],
  );

  const getAdjustedWeight = useCallback(
    (exerciseId: string, weekId?: number) => {
      const week = getWeek(weekId);
      const fallback =
        workouts
          .flatMap((workout) => workout.exercises)
          .find((exercise) => exercise.id === exerciseId)?.baseWeight ?? 0;
      const baseWeight = userWeights[exerciseId] ?? fallback;
      return roundToHalf(baseWeight * (week?.loadModifier ?? 1));
    },
    [getWeek, workouts, userWeights],
  );

  const handleOpenAdd = () => {
    setEditingExercise(null);
    setExerciseModalMode('add');
    setExerciseModalOpen(true);
  };

  const handleOpenEdit = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setExerciseModalMode('edit');
    setExerciseModalOpen(true);
  };

  const handleExerciseSubmit = async (
    payload: Omit<Exercise, 'id' | 'position' | 'baseWeight'>,
  ) => {
    if (exerciseModalMode === 'edit' && editingExercise) {
      await runMutation({
        type: 'editExercise',
        workoutId: currentWorkout.id,
        exerciseId: editingExercise.id,
        updates: payload,
      });
      return;
    }

    await runMutation({
      type: 'addExercise',
      workoutId: currentWorkout.id,
      exercise: payload,
    });
  };

  const handleDeleteExercise = (exercise: Exercise) => {
    Alert.alert(
      'Delete exercise',
      `Delete "${exercise.name}" from ${currentWorkout.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void runMutation({
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
    Alert.alert(
      'Reset all data?',
      'This will reset exercises, weights, weeks, days, timer settings, and sync state history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            void runMutation({ type: 'resetAllData' });
          },
        },
      ],
    );
  };

  const handleExportBackup = useCallback(async () => {
    if (!snapshot) {
      return;
    }
    try {
      const fileName = getBackupFileName();
      const payload = serializePwaBackupV2(snapshot);
      const file = new File(Paths.cache, fileName);
      file.create({ overwrite: true, intermediates: true });
      file.write(payload, { encoding: 'utf8' });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Export backup',
          UTI: 'public.json',
        });
      } else {
        Alert.alert('Backup exported', `Saved to app storage:\n${file.uri}`);
      }
      setLocalBackupOpen(false);
    } catch (error) {
      logError('backup/export failed', error);
      Alert.alert('Export failed', getErrorMessage(error));
    }
  }, [snapshot]);

  const handleImportBackup = useCallback(async () => {
    if (!snapshot) {
      return;
    }
    try {
      const picked = await File.pickFileAsync(undefined, 'application/json');
      const pickedFile = Array.isArray(picked) ? picked[0] : picked;
      if (!pickedFile) {
        throw new Error('No file selected.');
      }

      const fileText = await pickedFile.text();
      const migrated = parseAndMigrateBackup(fileText);
      const summary = computeImportDiff(
        toPwaBackupV2(snapshot),
        migrated.backup,
      );

      setPendingImport(migrated);
      setImportSummary(summary);
      setImportPreviewOpen(true);
      setLocalBackupOpen(false);
    } catch (error) {
      logError('backup/import failed', error);
      Alert.alert('Import failed', getErrorMessage(error));
    }
  }, [snapshot]);

  const handleConfirmImport = useCallback(async () => {
    if (!pendingImport) return;
    try {
      await runMutation({
        type: 'restoreRuntimeState',
        runtime: pendingImport.runtime,
        source: 'local-import',
      });
      setImportPreviewOpen(false);
      setPendingImport(null);
    } catch (error) {
      logError('backup/import confirm failed', error);
      Alert.alert('Import failed', getErrorMessage(error));
    }
  }, [pendingImport, runMutation]);

  const handleCancelImport = () => {
    setImportPreviewOpen(false);
    setPendingImport(null);
  };

  const _handleBackupToRelay = useCallback(async () => {
    if (!syncCoordinator) {
      return;
    }
    setSyncBusy(true);
    try {
      const result = await syncCoordinator.backupNow();
      await reload();
      await refreshSyncStatus();
      Alert.alert(
        'Backup complete',
        `Snapshot ${result.snapshotVersion} saved.`,
      );
      setLocalBackupOpen(false);
    } catch (error) {
      logError('sync/backup failed', error);
      Alert.alert('Backup failed', getErrorMessage(error));
    } finally {
      setSyncBusy(false);
    }
  }, [refreshSyncStatus, reload, syncCoordinator]);

  const _handleRestoreFromRelay = useCallback(async () => {
    if (!syncCoordinator) {
      return;
    }
    setSyncBusy(true);
    try {
      const restored = await syncCoordinator.restoreLatestIfEnabled();
      await reload();
      await refreshSyncStatus();
      Alert.alert(
        'Restore complete',
        `Restored snapshot ${restored.snapshotVersion}.`,
      );
      setLocalBackupOpen(false);
    } catch (error) {
      logError('sync/restore failed', error);
      Alert.alert('Restore failed', getErrorMessage(error));
    } finally {
      setSyncBusy(false);
    }
  }, [refreshSyncStatus, reload, syncCoordinator]);

  const finishOnboarding = useCallback(async () => {
    if (syncCoordinator) {
      await syncCoordinator.completeSetup('local-only', 'start-fresh');
    }
    await reload();
    await refreshSetupStatus();
    await refreshSyncStatus();
  }, [syncCoordinator, reload, refreshSetupStatus, refreshSyncStatus]);

  const handleSyncSetupSaveMode = useCallback(
    async (mode: SyncMode) => {
      if (!syncCoordinator) return;
      setSyncSetupBusy(true);
      setSyncSetupError(null);
      try {
        await syncCoordinator.updateSyncMode(mode);
        await refreshSetupStatus();
        await refreshSyncStatus();
      } catch (error) {
        logError('sync-setup/save-mode failed', error);
        setSyncSetupError(getErrorMessage(error));
      } finally {
        setSyncSetupBusy(false);
      }
    },
    [refreshSetupStatus, refreshSyncStatus, syncCoordinator],
  );

  const handleSyncSetupImportLocal = useCallback(async () => {
    setSyncSetupBusy(true);
    setSyncSetupError(null);
    try {
      const picked = await File.pickFileAsync(undefined, 'application/json');
      const pickedFile = Array.isArray(picked) ? picked[0] : picked;
      if (!pickedFile) {
        throw new Error('No file selected.');
      }

      const fileText = await pickedFile.text();
      const migrated = parseAndMigrateBackup(fileText);
      await runMutation({
        type: 'restoreRuntimeState',
        runtime: migrated.runtime,
        source: 'local-import',
      });
      await refreshSetupStatus();
      await refreshSyncStatus();
    } catch (error) {
      logError('sync-setup/import-local failed', error);
      setSyncSetupError(getErrorMessage(error));
    } finally {
      setSyncSetupBusy(false);
    }
  }, [refreshSetupStatus, refreshSyncStatus, runMutation]);

  const handleSyncSetupRestoreRelay = useCallback(async () => {
    if (!syncCoordinator) return;
    setSyncSetupBusy(true);
    setSyncSetupError(null);
    try {
      await syncCoordinator.restoreLatestIfEnabled();
      await reload();
      await refreshSetupStatus();
      await refreshSyncStatus();
    } catch (error) {
      logError('sync-setup/restore failed', error);
      setSyncSetupError(getErrorMessage(error));
    } finally {
      setSyncSetupBusy(false);
    }
  }, [refreshSetupStatus, refreshSyncStatus, reload, syncCoordinator]);

  const handleOpenGithub = async () => {
    const repoUrl = APP_CONFIG.githubRepoUrl;
    try {
      const canOpen = await Linking.canOpenURL(repoUrl);
      if (!canOpen) {
        Alert.alert('Cannot open link', repoUrl);
        return;
      }
      await Linking.openURL(repoUrl);
    } catch (error) {
      Alert.alert('Cannot open link', getErrorMessage(error));
    }
  };

  const handleOpenSyncSetup = () => {
    setSettingsOpen(false);
    setSyncSetupError(null);
    setSyncSetupOpen(true);
  };

  const syncMode = setupStatus?.setup.syncMode ?? 'local-only';
  const onboardingBlocking = !(
    setupStatus?.setup.hasCompletedOnboarding ?? false
  );

  if (!isReady || !snapshot || !setupStatus) {
    return (
      <SafeAreaView
        edges={['left', 'right']}
        style={[styles.safeArea, { backgroundColor: tokens.colors.bgBase }]}
      >
        <StatusBar style={effectiveThemeMode === 'dark' ? 'light' : 'dark'} />
        <View style={styles.loadingShell}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
          <Text
            style={[styles.loadingText, { color: tokens.colors.textSecondary }]}
          >
            Preparing local database and setup state...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (onboardingBlocking) {
    return (
      <SafeAreaView
        edges={['left', 'right']}
        style={[styles.safeArea, { backgroundColor: tokens.colors.bgBase }]}
      >
        <StatusBar style={effectiveThemeMode === 'dark' ? 'light' : 'dark'} />
        <OnboardingScreen
          tokens={tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          onComplete={finishOnboarding}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[styles.safeArea, { backgroundColor: tokens.colors.bgBase }]}
    >
      <StatusBar style={effectiveThemeMode === 'dark' ? 'light' : 'dark'} />
      <View style={styles.appShell}>
        <Header
          tokens={tokens}
          topInset={insets.top}
          onOpenLocalBackup={() => setLocalBackupOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onResetData={handleResetData}
        />

        <WorkoutView
          tokens={tokens}
          workout={currentWorkout}
          currentWeek={currentWeek}
          weekConfigs={weekConfigs}
          userWeights={userWeights}
          getAdjustedWeight={getAdjustedWeight}
          onWeekChange={(nextWeek) => {
            void runMutation({ type: 'setCurrentWeek', currentWeek: nextWeek });
          }}
          onOpenProgramSettings={() => setProgramSettingsOpen(true)}
          onOpenAddExercise={handleOpenAdd}
          onEditExercise={handleOpenEdit}
          onDeleteExercise={handleDeleteExercise}
          onAdjustWeight={(exerciseId, delta) => {
            const fallback =
              workouts
                .flatMap((w) => w.exercises)
                .find((e) => e.id === exerciseId)?.baseWeight ?? 0;
            const currentValue = userWeights[exerciseId] ?? fallback;
            void runMutation({
              type: 'setExerciseWeight',
              exerciseId,
              value: currentValue + delta,
            });
          }}
          onMoveExercise={(exerciseId, direction) => {
            void runMutation({
              type: 'reorderExercise',
              workoutId: currentWorkout.id,
              exerciseId,
              direction,
            });
          }}
          contentBottomPadding={layout.contentBottomPadding}
          fabBottom={layout.workoutFabBottom}
        />

        <RestTimer
          tokens={tokens}
          duration={restDuration}
          onDurationChange={(duration) => {
            void runMutation({
              type: 'setRestDuration',
              restDuration: duration,
            });
          }}
          fabBottom={layout.timerFabBottom}
          panelBottom={layout.timerPanelBottom}
          onExpandedChange={setTimerExpanded}
        />

        <Navigation
          tokens={tokens}
          currentDay={currentDay}
          dayConfigs={dayConfigs}
          onDayChange={(day) => {
            void runMutation({ type: 'setCurrentDay', currentDay: day });
          }}
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
          weekConfigs={weekConfigs}
          dayConfigs={dayConfigs}
          onClose={() => setProgramSettingsOpen(false)}
          onWeekConfigsChange={(nextWeekConfigs) => {
            void runMutation({
              type: 'replaceWeekConfigs',
              weekConfigs: nextWeekConfigs,
            });
          }}
          onDayConfigsChange={(nextDayConfigs) => {
            void runMutation({
              type: 'replaceDayConfigs',
              dayConfigs: nextDayConfigs,
            });
          }}
        />

        <LocalBackupModal
          open={localBackupOpen}
          tokens={tokens}
          syncMode={syncMode}
          syncSummary={formatSyncSummary(syncStatus)}
          busy={syncBusy}
          onClose={() => setLocalBackupOpen(false)}
          onExport={handleExportBackup}
          onImport={handleImportBackup}
          onOpenSyncSetup={handleOpenSyncSetup}
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

        <SettingsScreen
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
          onThemePreferenceChange={(next) => {
            void runMutation({ type: 'setThemeMode', themeMode: next });
          }}
          onClose={() => setSettingsOpen(false)}
          onOpenGithub={handleOpenGithub}
          onOpenSyncSetup={handleOpenSyncSetup}
        />

        <SyncSetupScreen
          open={syncSetupOpen}
          tokens={tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          currentMode={syncMode}
          busy={syncSetupBusy}
          errorMessage={syncSetupError}
          identityFingerprint={setupStatus.identityFingerprint}
          onClose={() => setSyncSetupOpen(false)}
          onSaveMode={handleSyncSetupSaveMode}
          onImportLocalBackup={handleSyncSetupImportLocal}
          onRestoreRelayBackup={handleSyncSetupRestoreRelay}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  appShell: {
    flex: 1,
  },
  loadingShell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
