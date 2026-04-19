import { File, Paths } from 'expo-file-system';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Linking, StyleSheet, useColorScheme, View } from 'react-native';
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
import {
  type AppPromptAction,
  AppPromptModal,
} from '../components/AppPromptModal';
import { BootstrapScreen } from '../components/BootstrapScreen';
import { Header } from '../components/Header';
import { ImportPreviewModal } from '../components/ImportPreviewModal';
import { LocalBackupModal } from '../components/LocalBackupModal';
import { Navigation } from '../components/Navigation';
import { OnboardingScreen } from '../components/OnboardingScreen';
import { ProgramSettingsModal } from '../components/ProgramSettingsModal';
import { RestTimer } from '../components/RestTimer';
import { SettingsScreen } from '../components/SettingsScreen';
import { WorkoutView } from '../components/WorkoutView';
import { APP_CONFIG } from '../config/app';
import { defaultDayConfigs } from '../data/workouts';
import type { WorkoutMutation } from '../storage/types';
import { useWorkoutStore } from '../storage/useWorkoutStore';
import { WorkoutRepository } from '../storage/workoutRepository';
import type { ThemeMode, ThemePreference } from '../theme/tokens';
import { getThemeTokens, resolveThemeMode } from '../theme/tokens';
import type { Exercise, WorkoutDay } from '../types';
import { scheduleIdleTask } from '../utils/idle';
import { roundToHalf } from '../utils/math';

const ACTION_DEBOUNCE_MS = 96;
const DAY_PERSIST_DEBOUNCE_MS = 220;

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
  const [pendingCurrentWeek, setPendingCurrentWeek] = useState<number | null>(
    null,
  );
  const [pendingCurrentDay, setPendingCurrentDay] = useState<WorkoutDay | null>(
    null,
  );
  const [pendingRestDuration, setPendingRestDuration] = useState<number | null>(
    null,
  );
  const [pendingThemePreference, setPendingThemePreference] =
    useState<ThemePreference | null>(null);
  const [promptConfig, setPromptConfig] = useState<{
    title: string;
    message: string;
    actions: AppPromptAction[];
  } | null>(null);
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const debouncedMutationsRef = useRef(new Map<string, WorkoutMutation>());
  const debounceTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const pendingDayPersistCancelRef = useRef<(() => void) | null>(null);
  const pendingDayPersistValueRef = useRef<WorkoutDay | null>(null);
  const pendingDayPersistTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const showPrompt = useCallback(
    (title: string, message: string, actions?: AppPromptAction[]) => {
      setPromptConfig({
        title,
        message,
        actions: actions ?? [{ label: 'OK' }],
      });
    },
    [],
  );

  const closePrompt = useCallback(() => {
    setPromptConfig(null);
  }, []);

  useEffect(() => {
    setRepository(new WorkoutRepository());
  }, []);

  const { snapshot, isReady, reload, applyMutation } =
    useWorkoutStore(repository);

  const themePreference: ThemePreference =
    pendingThemePreference ?? snapshot?.themeMode ?? 'system';
  const systemThemeMode: ThemeMode | null =
    systemScheme === 'dark' || systemScheme === 'light' ? systemScheme : null;
  const effectiveThemeMode = resolveThemeMode(themePreference, systemThemeMode);
  const currentWeek = pendingCurrentWeek ?? snapshot?.currentWeek ?? 1;
  const selectedDay =
    pendingCurrentDay ??
    snapshot?.currentDay ??
    defaultDayConfigs[0]?.id ??
    'push';
  const currentDay = useDeferredValue(selectedDay);
  const workouts = snapshot?.workouts ?? [];
  const userWeights = snapshot?.userWeights ?? {};
  const weekConfigs = snapshot?.weekConfigs ?? [];
  const dayConfigs = snapshot?.dayConfigs ?? defaultDayConfigs;
  const restDuration = pendingRestDuration ?? snapshot?.restDuration ?? 150;

  const exerciseBaseWeights = useMemo(() => {
    const map = new Map<string, number>();
    for (const workout of workouts) {
      for (const exercise of workout.exercises) {
        map.set(exercise.id, exercise.baseWeight);
      }
    }
    return map;
  }, [workouts]);

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

  const clearOptimisticForMutation = useCallback(
    (mutation: WorkoutMutation) => {
      if (mutation.type === 'setCurrentWeek') {
        setPendingCurrentWeek((prev) =>
          prev === mutation.currentWeek ? null : prev,
        );
        return;
      }
      if (mutation.type === 'setCurrentDay') {
        setPendingCurrentDay((prev) =>
          prev === mutation.currentDay ? null : prev,
        );
        return;
      }
      if (mutation.type === 'setRestDuration') {
        setPendingRestDuration((prev) =>
          prev === mutation.restDuration ? null : prev,
        );
        return;
      }
      if (mutation.type === 'setThemeMode') {
        setPendingThemePreference((prev) =>
          prev === mutation.themeMode ? null : prev,
        );
      }
    },
    [],
  );

  const resetOptimisticState = useCallback(() => {
    setPendingCurrentWeek(null);
    setPendingCurrentDay(null);
    setPendingRestDuration(null);
    setPendingThemePreference(null);
  }, []);

  const enqueueMutationTask = useCallback(
    async (task: () => Promise<void>) => {
      mutationQueueRef.current = mutationQueueRef.current
        .then(task)
        .catch(async (error) => {
          logError('mutation/queue failed', error);
          resetOptimisticState();
          try {
            await reload();
          } catch (reloadError) {
            logError('mutation/reload failed', reloadError);
          }
          showPrompt('Update failed', getErrorMessage(error));
        });
      return mutationQueueRef.current;
    },
    [reload, resetOptimisticState, showPrompt],
  );

  const commitMutation = useCallback(
    async (mutation: WorkoutMutation) => {
      await enqueueMutationTask(async () => {
        await applyMutation(mutation);
        clearOptimisticForMutation(mutation);
      });
    },
    [applyMutation, clearOptimisticForMutation, enqueueMutationTask],
  );

  const flushDebouncedMutation = useCallback(
    async (key: string) => {
      const next = debouncedMutationsRef.current.get(key);
      if (!next) {
        return;
      }
      debouncedMutationsRef.current.delete(key);
      debounceTimersRef.current.delete(key);
      await commitMutation(next);
    },
    [commitMutation],
  );

  const flushAllDebouncedMutations = useCallback(async () => {
    const keys = [...debouncedMutationsRef.current.keys()];
    for (const key of keys) {
      const timer = debounceTimersRef.current.get(key);
      if (timer) {
        clearTimeout(timer);
      }
      await flushDebouncedMutation(key);
    }
  }, [flushDebouncedMutation]);

  const queueDebouncedMutation = useCallback(
    (key: string, mutation: WorkoutMutation, delayMs = ACTION_DEBOUNCE_MS) => {
      debouncedMutationsRef.current.set(key, mutation);
      const previousTimer = debounceTimersRef.current.get(key);
      if (previousTimer) {
        clearTimeout(previousTimer);
      }
      const nextTimer = setTimeout(() => {
        void flushDebouncedMutation(key);
      }, delayMs);
      debounceTimersRef.current.set(key, nextTimer);
    },
    [flushDebouncedMutation],
  );

  useEffect(() => {
    return () => {
      for (const timer of debounceTimersRef.current.values()) {
        clearTimeout(timer);
      }
      debounceTimersRef.current.clear();
      debouncedMutationsRef.current.clear();
      pendingDayPersistCancelRef.current?.();
      pendingDayPersistCancelRef.current = null;
      if (pendingDayPersistTimerRef.current) {
        clearTimeout(pendingDayPersistTimerRef.current);
        pendingDayPersistTimerRef.current = null;
      }
    };
  }, []);

  const runMutation = useCallback(
    async (mutation: WorkoutMutation) => {
      await flushAllDebouncedMutations();
      await commitMutation(mutation);
    },
    [commitMutation, flushAllDebouncedMutations],
  );

  const runImmediateMutation = useCallback(
    async (mutation: WorkoutMutation) => {
      await commitMutation(mutation);
    },
    [commitMutation],
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
      const fallback = exerciseBaseWeights.get(exerciseId) ?? 0;
      const baseWeight = userWeights[exerciseId] ?? fallback;
      return roundToHalf(baseWeight * (week?.loadModifier ?? 1));
    },
    [exerciseBaseWeights, getWeek, userWeights],
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
    showPrompt(
      'Delete exercise',
      `Delete "${exercise.name}" from ${currentWorkout.name}?`,
      [
        { label: 'Cancel', tone: 'cancel' },
        {
          label: 'Delete',
          tone: 'destructive',
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
    showPrompt(
      'Reset all data?',
      'This will reset exercises, weights, weeks, days, timer settings, and sync state history.',
      [
        { label: 'Cancel', tone: 'cancel' },
        {
          label: 'Reset',
          tone: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const hasHardware =
                  await LocalAuthentication.hasHardwareAsync();
                const enrolled = await LocalAuthentication.isEnrolledAsync();
                if (!hasHardware || !enrolled) {
                  showPrompt(
                    'Authentication unavailable',
                    'Enable device authentication (biometric or PIN/passcode) to reset all data.',
                  );
                  return;
                }

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

                await runMutation({ type: 'resetAllData' });
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
        showPrompt('Backup exported', `Saved to app storage:\n${file.uri}`);
      }
      setLocalBackupOpen(false);
    } catch (error) {
      logError('backup/export failed', error);
      showPrompt('Export failed', getErrorMessage(error));
    }
  }, [showPrompt, snapshot]);

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
      showPrompt('Import failed', getErrorMessage(error));
    }
  }, [showPrompt, snapshot]);

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
      showPrompt('Import failed', getErrorMessage(error));
    }
  }, [pendingImport, runMutation, showPrompt]);

  const handleCancelImport = () => {
    setImportPreviewOpen(false);
    setPendingImport(null);
  };

  const handleMoveExercise = useCallback(
    (exerciseId: string, direction: 'up' | 'down') => {
      void runMutation({
        type: 'reorderExercise',
        workoutId: currentWorkout.id,
        exerciseId,
        direction,
      });
    },
    [runMutation, currentWorkout.id],
  );

  const finishOnboarding = useCallback(async () => {
    await repository?.markSetupDone();
    await reload();
  }, [repository, reload]);

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

  const handleQueueWeekChange = useCallback(
    (nextWeek: number) => {
      setPendingCurrentWeek(nextWeek);
      queueDebouncedMutation('settings:currentWeek', {
        type: 'setCurrentWeek',
        currentWeek: nextWeek,
      });
    },
    [queueDebouncedMutation],
  );

  const handleDayChange = useCallback(
    (nextDay: WorkoutDay) => {
      if (nextDay === selectedDay) {
        return;
      }
      setPendingCurrentDay(nextDay);
      pendingDayPersistValueRef.current = nextDay;
      pendingDayPersistCancelRef.current?.();
      if (pendingDayPersistTimerRef.current) {
        clearTimeout(pendingDayPersistTimerRef.current);
      }
      pendingDayPersistTimerRef.current = setTimeout(() => {
        pendingDayPersistTimerRef.current = null;
        pendingDayPersistCancelRef.current = scheduleIdleTask(() => {
          pendingDayPersistCancelRef.current = null;
          const latestDay = pendingDayPersistValueRef.current;
          if (!latestDay) {
            return;
          }
          void runImmediateMutation({
            type: 'setCurrentDay',
            currentDay: latestDay,
          });
        });
      }, DAY_PERSIST_DEBOUNCE_MS);
    },
    [runImmediateMutation, selectedDay],
  );

  const handleQueueRestDuration = useCallback(
    (nextDuration: number) => {
      setPendingRestDuration(nextDuration);
      queueDebouncedMutation('settings:restDuration', {
        type: 'setRestDuration',
        restDuration: nextDuration,
      });
    },
    [queueDebouncedMutation],
  );

  const handleQueueThemeMode = useCallback(
    (nextTheme: ThemePreference) => {
      setPendingThemePreference(nextTheme);
      queueDebouncedMutation('settings:themeMode', {
        type: 'setThemeMode',
        themeMode: nextTheme,
      });
    },
    [queueDebouncedMutation],
  );

  const handleAdjustWeight = useCallback(
    (exerciseId: string, delta: number) => {
      void runImmediateMutation({
        type: 'adjustExerciseWeight',
        exerciseId,
        delta,
      });
    },
    [runImmediateMutation],
  );

  const handleSetWeight = useCallback(
    (exerciseId: string, value: number) => {
      void runImmediateMutation({
        type: 'setExerciseWeight',
        exerciseId,
        value,
      });
    },
    [runImmediateMutation],
  );

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
          subtitle="Preparing local database"
          textPrimary={tokens.colors.textPrimary}
          textSecondary={tokens.colors.textSecondary}
        />
      </SafeAreaView>
    );
  }

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
          workout={currentWorkout}
          currentWeek={currentWeek}
          weekConfigs={weekConfigs}
          userWeights={userWeights}
          getAdjustedWeight={getAdjustedWeight}
          onWeekChange={handleQueueWeekChange}
          onOpenProgramSettings={() => setProgramSettingsOpen(true)}
          onOpenAddExercise={handleOpenAdd}
          onEditExercise={handleOpenEdit}
          onDeleteExercise={handleDeleteExercise}
          onAdjustWeight={handleAdjustWeight}
          onSetWeight={handleSetWeight}
          onMoveExercise={handleMoveExercise}
          contentBottomPadding={layout.contentBottomPadding}
          fabBottom={layout.workoutFabBottom}
        />

        <RestTimer
          tokens={tokens}
          duration={restDuration}
          onDurationChange={handleQueueRestDuration}
          fabBottom={layout.timerFabBottom}
          panelBottom={layout.timerPanelBottom}
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
          weekConfigs={weekConfigs}
          dayConfigs={dayConfigs}
          onClose={() => setProgramSettingsOpen(false)}
          onWeekConfigsChange={(nextWeekConfigs) => {
            void runImmediateMutation({
              type: 'replaceWeekConfigs',
              weekConfigs: nextWeekConfigs,
            });
          }}
          onDayConfigsChange={(nextDayConfigs) => {
            void runImmediateMutation({
              type: 'replaceDayConfigs',
              dayConfigs: nextDayConfigs,
            });
          }}
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
          onThemePreferenceChange={handleQueueThemeMode}
          onResetData={handleResetData}
          onClose={() => setSettingsOpen(false)}
          onOpenGithub={handleOpenGithub}
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  appShell: {
    flex: 1,
  },
});
