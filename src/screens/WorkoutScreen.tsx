import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { startTransition, useEffect, useMemo } from 'react';
import { Linking, useColorScheme, View } from 'react-native';
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
import { DonateModal } from '../components/modals/DonateModal';
import { ImportPreviewModal } from '../components/modals/ImportPreviewModal';
import { LocalBackupModal } from '../components/modals/LocalBackupModal';
import { ProgramSettingsModal } from '../components/modals/ProgramSettingsModal';
import { SettingsModal } from '../components/modals/SettingsModal';
import { Navigation } from '../components/Navigation';
import { OnboardingScreen } from '../components/OnboardingScreen';
import { RestTimer } from '../components/RestTimer';
import { WorkoutView } from '../components/WorkoutView';
import { APP_CONFIG } from '../config/app';
import { type DonationTarget, getDonationTargets } from '../config/donation';
import { defaultDayConfigs } from '../data/workouts';
import { useWorkoutStore } from '../store/workoutStore';
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

  const {
    snapshot,
    isReady,
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
    donateModalOpen,
    setDonateModalOpen,
    localBackupOpen,
    setLocalBackupOpen,
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

  const systemThemeMode: ThemeMode | null =
    systemScheme === 'dark' || systemScheme === 'light' ? systemScheme : null;
  const themePreference: ThemePreference = snapshot?.themeMode ?? 'system';
  const effectiveThemeMode = resolveThemeMode(themePreference, systemThemeMode);
  const tokens = useMemo(
    () => getThemeTokens(effectiveThemeMode, { enableDynamicColor: false }),
    [effectiveThemeMode],
  );

  const currentWeek = snapshot?.currentWeek ?? 1;
  const selectedDay =
    snapshot?.currentDay ?? defaultDayConfigs[0]?.id ?? 'push';
  const currentDay = selectedDay;
  const workouts = snapshot?.workouts ?? [];
  const userWeights = snapshot?.userWeights ?? {};
  const weekConfigs = snapshot?.weekConfigs ?? [];
  const dayConfigs = snapshot?.dayConfigs ?? defaultDayConfigs;
  const restDuration = snapshot?.restDuration ?? 150;
  const weightUnit: WeightUnit = snapshot?.weightUnit ?? 'kg';

  const exerciseBaseWeights = useMemo(() => {
    const map = new Map<string, number>();
    for (const workout of workouts) {
      for (const exercise of workout.exercises) {
        map.set(exercise.id, exercise.baseWeight);
      }
    }
    return map;
  }, [workouts]);

  const donationTargets = useMemo(() => getDonationTargets(), []);
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
      'Delete exercise',
      `Delete "${exercise.name}" from ${currentWorkout.name}?`,
      [
        { label: 'Cancel', tone: 'cancel' },
        {
          label: 'Delete',
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
      'Reset all data?',
      'This will reset exercises, weights, weeks, days, timer settings, and sync state history.',
      [
        { label: 'Cancel', tone: 'cancel' },
        {
          label: 'Reset',
          tone: 'destructive',
          onPress: () => {
            setSettingsOpen(false);
            void (async () => {
              try {
                const enrolledLevel =
                  await LocalAuthentication.getEnrolledLevelAsync();
                if (enrolledLevel !== LocalAuthentication.SecurityLevel.NONE) {
                  const result = await LocalAuthentication.authenticateAsync({
                    promptMessage: 'Confirm reset',
                    cancelLabel: 'Cancel',
                    disableDeviceFallback: false,
                  });

                  if (!result.success) {
                    showPrompt(
                      'Reset canceled',
                      'System authentication did not confirm the reset.',
                    );
                    return;
                  }
                }

                await applyMutation({ type: 'resetAllData' });
              } catch (error) {
                logError('reset/authentication failed', error);
                showPrompt('Reset failed', getErrorMessage(error));
              }
            })();
          },
        },
      ],
    );
  };

  const handleExportBackup = async () => {
    if (!snapshot) return;
    try {
      const fileName = getBackupFileName();
      const payload = serializePwaBackupV2(snapshot);
      const file = new File(Paths.cache, fileName);
      file.create({ overwrite: true, intermediates: true });
      file.write(payload, { encoding: 'utf8' });

      if (await Sharing.isAvailableAsync()) {
        try {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/json',
            dialogTitle: 'Export backup',
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
          'Sharing unavailable',
          'Sharing is not available on this device/platform.',
        );
      }
      setLocalBackupOpen(false);
    } catch (error) {
      logError('backup/export failed', error);
      showPrompt('Export failed', getErrorMessage(error));
    }
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
      setLocalBackupOpen(false);
    } catch (error) {
      const message = getErrorMessage(error).toLowerCase();
      if (message.includes('cancel')) return;
      logError('backup/import failed', error);
      showPrompt('Import failed', getErrorMessage(error));
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
      showPrompt('Import failed', getErrorMessage(error));
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
    await reload();
  };

  const handleOpenGithub = async () => {
    const repoUrl = APP_CONFIG.githubRepoUrl;
    try {
      const canOpen = await Linking.canOpenURL(repoUrl);
      if (!canOpen) {
        showPrompt('Cannot open link', repoUrl);
        return;
      }
      await Linking.openURL(repoUrl);
    } catch (error) {
      showPrompt('Cannot open link', getErrorMessage(error));
    }
  };

  const handleOpenDonationTarget = async (target: DonationTarget) => {
    try {
      const canOpen = await Linking.canOpenURL(target.uri);
      if (!canOpen) {
        showPrompt('Cannot open wallet link', target.uri);
        return;
      }
      await Linking.openURL(target.uri);
    } catch (error) {
      showPrompt('Cannot open wallet link', getErrorMessage(error));
    }
  };

  const handleCopyDonationTarget = async (target: DonationTarget) => {
    try {
      await Clipboard.setStringAsync(target.copyValue);
    } catch (error) {
      showPrompt('Copy failed', getErrorMessage(error));
    }
  };

  const handleWeekChange = (nextWeek: number) => {
    void applyMutation({ type: 'setCurrentWeek', currentWeek: nextWeek });
  };

  const handleDayChange = (nextDay: WorkoutDay) => {
    if (nextDay === selectedDay) return;
    startTransition(() => {
      void applyMutation({ type: 'setCurrentDay', currentDay: nextDay });
    });
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

  const handleAdjustWeight = (exerciseId: string, delta: number) => {
    void applyMutation({ type: 'adjustExerciseWeight', exerciseId, delta });
  };

  const handleSetWeight = (exerciseId: string, value: number) => {
    void applyMutation({ type: 'setExerciseWeight', exerciseId, value });
  };

  const handleReorderDayConfigs = (nextDayConfigs: typeof dayConfigs) => {
    void applyMutation({
      type: 'replaceDayConfigs',
      dayConfigs: nextDayConfigs,
    });
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
          onOpenLocalBackup={() => setLocalBackupOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <WorkoutView
          tokens={tokens}
          weightUnit={weightUnit}
          workout={currentWorkout}
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
          onReorderDayConfigs={handleReorderDayConfigs}
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

        <LocalBackupModal
          open={localBackupOpen}
          tokens={tokens}
          onClose={() => setLocalBackupOpen(false)}
          onExport={handleExportBackup}
          onImport={handleImportBackup}
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
          onResetData={handleResetData}
          onClose={() => setSettingsOpen(false)}
          onOpenGithub={handleOpenGithub}
          onOpenDonate={() => setDonateModalOpen(true)}
        />

        <DonateModal
          open={donateModalOpen}
          tokens={tokens}
          targets={donationTargets}
          onClose={() => setDonateModalOpen(false)}
          onOpenTarget={(target) => {
            void handleOpenDonationTarget(target);
          }}
          onCopyTarget={(target) => {
            void handleCopyDonationTarget(target);
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
