import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  computeImportDiff,
  getBackupFileName,
  LOCAL_STATE_STORAGE_KEY,
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
import { ProgramSettingsModal } from '../components/ProgramSettingsModal';
import { RestTimer } from '../components/RestTimer';
import { SettingsScreen } from '../components/SettingsScreen';
import { WorkoutView } from '../components/WorkoutView';
import { APP_CONFIG } from '../config/app';
import {
  buildInitialWeights,
  defaultDayConfigs,
  defaultWeekConfigs,
  defaultWorkouts,
} from '../data/workouts';
import type { ThemeMode } from '../theme/tokens';
import { getThemeTokens } from '../theme/tokens';
import type {
  DayConfig,
  Exercise,
  UserWeights,
  WeekConfig,
  WorkoutDay,
  WorkoutSession,
} from '../types';

function cloneWorkouts() {
  return JSON.parse(JSON.stringify(defaultWorkouts)) as WorkoutSession[];
}

function roundToHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function createExerciseId(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'exercise'}-${Date.now().toString(36)}`;
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

export function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [currentWeek, setCurrentWeek] = useState<number>(1);
  const [currentDay, setCurrentDay] = useState<WorkoutDay>('push');
  const [workouts, setWorkouts] = useState<WorkoutSession[]>(cloneWorkouts);
  const [userWeights, setUserWeights] = useState<UserWeights>(() =>
    buildInitialWeights(defaultWorkouts),
  );
  const [weekConfigs, setWeekConfigs] =
    useState<WeekConfig[]>(defaultWeekConfigs);
  const [dayConfigs, setDayConfigs] = useState<DayConfig[]>(defaultDayConfigs);
  const [restDuration, setRestDuration] = useState(150);
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
  const [isHydratingState, setIsHydratingState] = useState(true);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedPayloadRef = useRef<string | null>(null);

  const tokens = useMemo(
    () => getThemeTokens(themeMode, { enableDynamicColor: false }),
    [themeMode],
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
        workouts.flatMap((w) => w.exercises).find((e) => e.id === exerciseId)
          ?.baseWeight ?? 0;
      const baseWeight = userWeights[exerciseId] ?? fallback;
      return roundToHalf(baseWeight * (week?.loadModifier ?? 1));
    },
    [getWeek, workouts, userWeights],
  );

  const updateWeight = useCallback((exerciseId: string, value: number) => {
    setUserWeights((prev) => ({
      ...prev,
      [exerciseId]: Math.max(0, roundToHalf(value)),
    }));
  }, []);

  const addExercise = useCallback(
    (
      workoutId: WorkoutDay,
      input: Omit<Exercise, 'id' | 'position' | 'baseWeight'>,
    ) => {
      const id = createExerciseId(input.name);
      setWorkouts((prev) =>
        prev.map((workout) => {
          if (workout.id !== workoutId) return workout;
          const position =
            workout.exercises.length > 0
              ? Math.max(...workout.exercises.map((e) => e.position)) + 1
              : 0;
          return {
            ...workout,
            exercises: [
              ...workout.exercises,
              { id, baseWeight: 0, position, ...input },
            ],
          };
        }),
      );
      setUserWeights((prev) => ({ ...prev, [id]: 0 }));
    },
    [],
  );

  const editExercise = useCallback(
    (workoutId: WorkoutDay, exerciseId: string, updates: Partial<Exercise>) => {
      setWorkouts((prev) =>
        prev.map((workout) => {
          if (workout.id !== workoutId) return workout;
          return {
            ...workout,
            exercises: workout.exercises.map((exercise) =>
              exercise.id === exerciseId
                ? { ...exercise, ...updates }
                : exercise,
            ),
          };
        }),
      );
    },
    [],
  );

  const deleteExercise = useCallback(
    (workoutId: WorkoutDay, exerciseId: string) => {
      setWorkouts((prev) =>
        prev.map((workout) => {
          if (workout.id !== workoutId) return workout;
          return {
            ...workout,
            exercises: workout.exercises.filter(
              (exercise) => exercise.id !== exerciseId,
            ),
          };
        }),
      );
      setUserWeights((prev) => {
        const next = { ...prev };
        delete next[exerciseId];
        return next;
      });
    },
    [],
  );

  const reorderExercises = useCallback(
    (workoutId: WorkoutDay, exerciseId: string, direction: 'up' | 'down') => {
      setWorkouts((prev) =>
        prev.map((workout) => {
          if (workout.id !== workoutId) return workout;
          const ordered = [...workout.exercises].sort(
            (a, b) => a.position - b.position,
          );
          const index = ordered.findIndex(
            (exercise) => exercise.id === exerciseId,
          );
          if (index === -1) return workout;
          const target = direction === 'up' ? index - 1 : index + 1;
          if (target < 0 || target >= ordered.length) return workout;

          [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
          return {
            ...workout,
            exercises: ordered.map((exercise, i) => ({
              ...exercise,
              position: i,
            })),
          };
        }),
      );
    },
    [],
  );

  const handleDayConfigsChange = useCallback(
    (nextDayConfigs: DayConfig[]) => {
      setDayConfigs(nextDayConfigs);
      setWorkouts((prev) => {
        const byId = new Map(prev.map((workout) => [workout.id, workout]));
        return nextDayConfigs.map((day, index) => {
          const existing = byId.get(day.id);
          if (existing) return existing;
          return {
            id: day.id,
            name: `${day.name} Day`,
            description: `Custom session ${index + 1}`,
            exercises: [],
          };
        });
      });

      if (
        !nextDayConfigs.some((day) => day.id === currentDay) &&
        nextDayConfigs[0]
      ) {
        setCurrentDay(nextDayConfigs[0].id);
      }
    },
    [currentDay],
  );

  const handleWeekConfigsChange = useCallback(
    (nextWeekConfigs: WeekConfig[]) => {
      setWeekConfigs(nextWeekConfigs);
      if (!nextWeekConfigs.some((week) => week.id === currentWeek)) {
        setCurrentWeek(nextWeekConfigs[0]?.id ?? 1);
      }
    },
    [currentWeek],
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

  const handleExerciseSubmit = (
    payload: Omit<Exercise, 'id' | 'position' | 'baseWeight'>,
  ) => {
    if (exerciseModalMode === 'edit' && editingExercise) {
      editExercise(currentWorkout.id, editingExercise.id, payload);
      return;
    }
    addExercise(currentWorkout.id, payload);
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
          onPress: () => deleteExercise(currentWorkout.id, exercise.id),
        },
      ],
    );
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset all data?',
      'This will reset exercises, weights, weeks, days, and timer settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setCurrentWeek(1);
            setCurrentDay('push');
            setWeekConfigs(defaultWeekConfigs);
            setDayConfigs(defaultDayConfigs);
            setWorkouts(cloneWorkouts());
            setUserWeights(buildInitialWeights(defaultWorkouts));
            setRestDuration(150);
          },
        },
      ],
    );
  };

  const buildCurrentRuntimeState = useCallback(
    () => ({
      workouts,
      userWeights,
      weekConfigs,
      dayConfigs,
      currentWeek,
      currentDay,
      restDuration,
      themeMode,
    }),
    [
      workouts,
      userWeights,
      weekConfigs,
      dayConfigs,
      currentWeek,
      currentDay,
      restDuration,
      themeMode,
    ],
  );

  const buildCurrentBackupData = useCallback(
    () => toPwaBackupV2(buildCurrentRuntimeState()),
    [buildCurrentRuntimeState],
  );

  const applyImportedState = useCallback((imported: MigratedBackupResult) => {
    const next = imported.runtime;
    setWorkouts(next.workouts);
    setUserWeights(next.userWeights);
    setWeekConfigs(next.weekConfigs);
    setDayConfigs(next.dayConfigs);
    setCurrentWeek(next.currentWeek);
    setCurrentDay(next.currentDay);
    setRestDuration(next.restDuration);
    setThemeMode(next.themeMode);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateState() {
      try {
        const raw = await AsyncStorage.getItem(LOCAL_STATE_STORAGE_KEY);
        if (!raw || cancelled) return;
        const migrated = parseAndMigrateBackup(raw);
        if (cancelled) return;
        lastPersistedPayloadRef.current = raw;
        applyImportedState(migrated);
      } catch (error) {
        logError('state/hydrate failed', error);
      } finally {
        if (!cancelled) {
          setIsHydratingState(false);
        }
      }
    }

    hydrateState();

    return () => {
      cancelled = true;
    };
  }, [applyImportedState]);

  useEffect(() => {
    if (isHydratingState) return;

    const payload = serializePwaBackupV2(buildCurrentRuntimeState());
    if (payload === lastPersistedPayloadRef.current) {
      return;
    }

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = setTimeout(() => {
      AsyncStorage.setItem(LOCAL_STATE_STORAGE_KEY, payload)
        .then(() => {
          lastPersistedPayloadRef.current = payload;
        })
        .catch((error) => {
          logError('state/persist failed', error);
        });
    }, 350);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, [buildCurrentRuntimeState, isHydratingState]);

  const handleExportBackup = useCallback(async () => {
    try {
      const fileName = getBackupFileName();
      const payload = serializePwaBackupV2(buildCurrentRuntimeState());
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
  }, [buildCurrentRuntimeState]);

  const handleImportBackup = useCallback(async () => {
    try {
      const picked = await File.pickFileAsync(undefined, 'application/json');
      const pickedFile = Array.isArray(picked) ? picked[0] : picked;
      if (!pickedFile) {
        throw new Error('No file selected.');
      }

      const fileText = await pickedFile.text();
      const migrated = parseAndMigrateBackup(fileText);
      const summary = computeImportDiff(
        buildCurrentBackupData(),
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
  }, [buildCurrentBackupData]);

  const handleConfirmImport = () => {
    if (!pendingImport) return;
    applyImportedState(pendingImport);
    setImportPreviewOpen(false);
    setPendingImport(null);
  };

  const handleCancelImport = () => {
    setImportPreviewOpen(false);
    setPendingImport(null);
  };

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

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[styles.safeArea, { backgroundColor: tokens.colors.bgBase }]}
    >
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <View style={styles.appShell}>
        <Header
          tokens={tokens}
          topInset={insets.top}
          onOpenLocalBackup={() => setLocalBackupOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleTheme={() =>
            setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))
          }
          onResetData={handleResetData}
        />

        <WorkoutView
          tokens={tokens}
          workout={currentWorkout}
          currentWeek={currentWeek}
          weekConfigs={weekConfigs}
          userWeights={userWeights}
          getAdjustedWeight={getAdjustedWeight}
          onWeekChange={setCurrentWeek}
          onOpenProgramSettings={() => setProgramSettingsOpen(true)}
          onOpenAddExercise={handleOpenAdd}
          onEditExercise={handleOpenEdit}
          onDeleteExercise={handleDeleteExercise}
          onAdjustWeight={(exerciseId, delta) =>
            updateWeight(exerciseId, (userWeights[exerciseId] ?? 0) + delta)
          }
          onMoveExercise={(exerciseId, direction) =>
            reorderExercises(currentWorkout.id, exerciseId, direction)
          }
          contentBottomPadding={layout.contentBottomPadding}
          fabBottom={layout.workoutFabBottom}
        />

        <RestTimer
          tokens={tokens}
          duration={restDuration}
          onDurationChange={setRestDuration}
          fabBottom={layout.timerFabBottom}
          panelBottom={layout.timerPanelBottom}
        />

        <Navigation
          tokens={tokens}
          currentDay={currentDay}
          dayConfigs={dayConfigs}
          onDayChange={setCurrentDay}
          bottomPadding={layout.navBottomPadding}
          minHeight={layout.navHeight}
        />

        <AddExerciseModal
          open={exerciseModalOpen}
          mode={exerciseModalMode}
          tokens={tokens}
          initialExercise={editingExercise}
          onClose={() => setExerciseModalOpen(false)}
          onSubmit={handleExerciseSubmit}
        />

        <ProgramSettingsModal
          open={programSettingsOpen}
          tokens={tokens}
          weekConfigs={weekConfigs}
          dayConfigs={dayConfigs}
          onClose={() => setProgramSettingsOpen(false)}
          onWeekConfigsChange={handleWeekConfigsChange}
          onDayConfigsChange={handleDayConfigsChange}
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
          onConfirm={handleConfirmImport}
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
          onClose={() => setSettingsOpen(false)}
          onOpenGithub={handleOpenGithub}
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
