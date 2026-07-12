import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { BootstrapScreen } from '@/components/BootstrapScreen';
import { Header } from '@/components/Header';
import { AddExerciseModal } from '@/components/modals/AddExerciseModal';
import { AppPromptModal } from '@/components/modals/AppPromptModal';
import { BackupActionModal } from '@/components/modals/BackupActionModal';
import { ExerciseSettingsModal } from '@/components/modals/ExerciseSettingsModal';
import { ImportPreviewModal } from '@/components/modals/ImportPreviewModal';
import { LanguageListModal } from '@/components/modals/LanguageListModal';
import { ProgramLibraryModal } from '@/components/modals/ProgramLibraryModal';
import { ProgramSettingsModal } from '@/components/modals/ProgramSettingsModal';
import { ProgressionSuggestionsModal } from '@/components/modals/ProgressionSuggestionsModal';
import { ScanFromDeviceModal } from '@/components/modals/ScanFromDeviceModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { ShareToDeviceModal } from '@/components/modals/ShareToDeviceModal';
import { SyncCreateRoomModal } from '@/components/modals/SyncCreateRoomModal';
import { SyncDebugInfoModal } from '@/components/modals/SyncDebugInfoModal';
import { SyncFirstDecisionModal } from '@/components/modals/SyncFirstDecisionModal';
import { SyncJoinRoomModal } from '@/components/modals/SyncJoinRoomModal';
import { SyncQuickInfoModal } from '@/components/modals/SyncQuickInfoModal';
import { SyncRoomKeyScanModal } from '@/components/modals/SyncRoomKeyScanModal';
import { WorkoutLogModal } from '@/components/modals/WorkoutLogModal';
import { Navigation } from '@/components/Navigation';
import { OnboardingScreen } from '@/components/OnboardingScreen';
import { RestTimer } from '@/components/RestTimer';
import { WorkoutDayStack } from '@/components/WorkoutDayStack';
import { APP_CONFIG } from '@/config/app';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import i18n, { SUPPORTED_I18N_LANGUAGE_CODES } from '@/i18n';
import { useSystemLanguage } from '@/i18n/systemLanguage';
import { styles } from '@/screens/styles';
import {
  applyWorkoutMutation,
  closePrompt,
  initializeWorkoutRuntime,
  refreshSyncLogs,
  saveUserExerciseSettings,
  saveWorkoutSessionLog,
  setActiveProgram,
  showPrompt,
} from '@/screens/workout/services';
import { useBackupFlow } from '@/screens/workout/useBackupFlow';
import { useSettingsFlow } from '@/screens/workout/useSettingsFlow';
import { useSyncFlow } from '@/screens/workout/useSyncFlow';
import { useWorkoutActions } from '@/screens/workout/useWorkoutActions';
import { useWorkoutDerivedState } from '@/screens/workout/useWorkoutDerivedState';
import { useSyncStore } from '@/store/syncStore';
import { useWorkoutDataStore } from '@/store/workoutDataStore';
import { useWorkoutUiStore } from '@/store/workoutUiStore';
import type { ThemeMode } from '@/theme/tokens';
import type { Exercise, WorkoutSessionLog } from '@/types';
import { getErrorMessage, logError } from '@/utils/errors';
import { buildWorkingWeightSettingUpdate } from '@/utils/exerciseSettings';
import { buildProgressionSuggestions } from '@/utils/progression';

export function WorkoutScreen() {
  useEffect(() => {
    void initializeWorkoutRuntime();
  }, []);

  const insets = useSafeAreaInsets();
  const responsiveLayout = useResponsiveLayout();
  const systemScheme = useColorScheme();
  const systemLanguage = useSystemLanguage(SUPPORTED_I18N_LANGUAGE_CODES, 'en');
  const [exerciseModalOpen, setExerciseModalOpen] = useState(false);
  const [exerciseModalMode, setExerciseModalMode] = useState<'add' | 'edit'>(
    'add',
  );
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(
    null,
  );
  const [programSettingsOpen, setProgramSettingsOpen] = useState(false);
  const [programLibraryOpen, setProgramLibraryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncDebugOpen, setSyncDebugOpen] = useState(false);
  const [languageListOpen, setLanguageListOpen] = useState(false);
  const [workoutLogOpen, setWorkoutLogOpen] = useState(false);
  const [progressionSuggestionsOpen, setProgressionSuggestionsOpen] =
    useState(false);
  const [exerciseSettingsOpen, setExerciseSettingsOpen] = useState(false);
  const [exerciseSettingsTarget, setExerciseSettingsTarget] =
    useState<Exercise | null>(null);
  const [timerExpanded, setTimerExpanded] = useState(false);
  const [restTimerPresetDuration, setRestTimerPresetDuration] = useState<
    number | null
  >(null);
  const [restTimerOpenRequest, setRestTimerOpenRequest] = useState(0);

  const snapshot = useWorkoutDataStore((state) => state.snapshot);
  const isReady = useWorkoutDataStore((state) => state.isReady);
  const syncHealth = useSyncStore((state) => state.syncHealth);
  const syncState = useSyncStore((state) => state.syncState);
  const pairedDevices = useSyncStore((state) => state.pairedDevices);
  const localDeviceDisplayName = useSyncStore(
    (state) => state.localDeviceDisplayName,
  );
  const syncLogs = useSyncStore((state) => state.syncLogs);
  const promptConfig = useWorkoutUiStore((state) => state.promptConfig);
  const progressionSuggestions = useWorkoutUiStore(
    (state) => state.progressionSuggestions,
  );

  useEffect(() => {
    if (progressionSuggestions.length === 0) {
      setProgressionSuggestionsOpen(false);
    }
  }, [progressionSuggestions.length]);

  useEffect(() => {
    const preferred = snapshot?.language ?? 'system';
    const effective = preferred === 'system' ? systemLanguage : preferred;
    if (effective && effective !== i18n.language) {
      i18n.changeLanguage(effective);
    }
  }, [snapshot?.language, systemLanguage]);

  const systemThemeMode: ThemeMode | null =
    systemScheme === 'dark' || systemScheme === 'light' ? systemScheme : null;

  const derived = useWorkoutDerivedState({
    snapshot,
    insets,
    responsiveLayout,
    systemThemeMode,
  });
  const workoutActions = useWorkoutActions({
    currentWorkout: derived.currentWorkout,
    editingExerciseId,
    exerciseModalMode,
    setEditingExerciseId,
    setExerciseModalMode,
    setExerciseModalOpen,
  });
  const settingsFlow = useSettingsFlow(systemLanguage, () => {
    setSettingsOpen(false);
  });
  const backupFlow = useBackupFlow();
  const syncFlow = useSyncFlow({ settingsOpen, syncDebugOpen });

  async function handleWorkoutLogSave(log: WorkoutSessionLog) {
    await saveWorkoutSessionLog(log);

    const suggestions = buildProgressionSuggestions({
      workoutLog: log,
      userExerciseSettings: derived.userExerciseSettings,
      userWeights: derived.userWeights,
    });
    if (suggestions.length > 0) {
      useWorkoutUiStore.getState().appendProgressionSuggestions(suggestions);
      setProgressionSuggestionsOpen(true);
    }
  }

  async function handleApplyProgressionSuggestion(
    suggestionId: string,
    nextWeightKg: number,
  ) {
    const suggestion = progressionSuggestions.find(
      (item) => item.id === suggestionId,
    );
    if (!suggestion) {
      return;
    }

    await saveUserExerciseSettings(
      buildWorkingWeightSettingUpdate({
        exerciseId: suggestion.exerciseId,
        workingWeight: nextWeightKg,
        current: derived.userExerciseSettings[suggestion.exerciseId] ?? null,
        weightUnit: derived.weightUnit,
        updatedAt: new Date().toISOString(),
      }),
    );
    useWorkoutUiStore.getState().removeProgressionSuggestion(suggestionId);
  }

  function handleSkipProgressionSuggestion(suggestionId: string) {
    useWorkoutUiStore.getState().removeProgressionSuggestion(suggestionId);
  }

  async function handleSaveExerciseSettings(
    settings: Parameters<typeof saveUserExerciseSettings>[0],
  ) {
    await saveUserExerciseSettings(settings);
  }

  const sharedSyncModals = (
    <>
      <SyncCreateRoomModal
        open={syncFlow.createRoomOpen}
        tokens={derived.tokens}
        topInset={insets.top}
        bottomInset={insets.bottom}
        invitePayload={syncFlow.syncRoomInvite}
        isStarting={syncFlow.createRoomStarting}
        localSummary={syncFlow.localSyncSummary}
        onClose={() => syncFlow.setCreateRoomOpen(false)}
      />

      <SyncJoinRoomModal
        open={syncFlow.joinRoomOpen}
        tokens={derived.tokens}
        topInset={insets.top}
        bottomInset={insets.bottom}
        localSummary={syncFlow.localSyncSummary}
        onJoinRoom={syncFlow.handleJoinRoom}
        onScanRoomKey={() => syncFlow.setJoinRoomScanOpen(true)}
        onClose={() => syncFlow.setJoinRoomOpen(false)}
      />

      <SyncRoomKeyScanModal
        open={syncFlow.joinRoomScanOpen}
        tokens={derived.tokens}
        topInset={insets.top}
        bottomInset={insets.bottom}
        onScanPayload={(payload) => syncFlow.handleJoinRoom(payload, false)}
        onClose={() => syncFlow.setJoinRoomScanOpen(false)}
      />

      <SyncFirstDecisionModal
        open={
          syncState?.roomBindingState === 'conflict_requires_decision' ||
          syncState?.roomBindingState === 'active_conflict_requires_decision'
        }
        tokens={derived.tokens}
        topInset={insets.top}
        bottomInset={insets.bottom}
        localSummary={
          syncState?.pendingLocalSummary ?? derived.localSyncSummary
        }
        remoteSummary={syncState?.pendingRemoteSummary ?? null}
        conflictSummary={syncState?.pendingConflictSummary ?? null}
        workoutNameMap={derived.workoutNameMap}
        exerciseNameMap={derived.exerciseNameMap}
        onChooseLocal={async () => {
          await syncFlow.handleResolveFirstSyncDecision('local_chosen');
        }}
        onChooseRemote={async () => {
          await syncFlow.handleResolveFirstSyncDecision('remote_chosen');
        }}
        onChooseMerge={async () => {
          await syncFlow.handleResolveFirstSyncDecision('merge_chosen');
        }}
        onClose={async () => {
          await syncFlow.handleRefreshSync();
        }}
      />
    </>
  );

  if (derived.onboardingBlocking) {
    return (
      <>
        {sharedSyncModals}
        <SafeAreaView
          edges={['left', 'right']}
          style={[
            styles.safeArea,
            { backgroundColor: derived.tokens.colors.bgBase },
          ]}
        >
          <StatusBar style={derived.statusBarStyle} hidden={false} />
          <NavigationBar style={derived.navigationBarStyle} hidden={false} />
          <OnboardingScreen
            tokens={derived.tokens}
            topInset={insets.top}
            bottomInset={insets.bottom}
            weightUnit={derived.weightUnit}
            onWeightUnitChange={settingsFlow.handleWeightUnitChange}
            onOpenSyncCreate={syncFlow.handleOnboardingOpenCreate}
            onOpenSyncJoin={syncFlow.handleOnboardingOpenJoin}
            onComplete={workoutActions.finishOnboarding}
          />
        </SafeAreaView>
      </>
    );
  }

  if (!isReady || !snapshot) {
    return (
      <SafeAreaView
        edges={['left', 'right']}
        style={[
          styles.safeArea,
          { backgroundColor: derived.tokens.colors.bgBase },
        ]}
      >
        <StatusBar style={derived.statusBarStyle} hidden={false} />
        <NavigationBar style={derived.navigationBarStyle} hidden={false} />
        <BootstrapScreen
          backgroundColor={derived.tokens.colors.bgBase}
          accentColor={derived.tokens.colors.primary}
          imageSource={require('../../assets/pearlift_transparent.png')}
          title={APP_CONFIG.name}
          subtitle="Welcome!"
          textPrimary={derived.tokens.colors.textPrimary}
          textSecondary={derived.tokens.colors.textSecondary}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[
        styles.safeArea,
        { backgroundColor: derived.tokens.colors.bgBase },
      ]}
    >
      <StatusBar style={derived.statusBarStyle} hidden={false} />
      <NavigationBar style={derived.navigationBarStyle} hidden={false} />
      <View style={styles.appShell}>
        <Header
          tokens={derived.tokens}
          topInset={insets.top}
          maxWidth={responsiveLayout.contentMaxWidth}
          program={derived.program}
          showProgramLibraryAction={derived.availablePrograms.length > 1}
          syncHealth={syncHealth}
          onOpenProgramLibrary={() => setProgramLibraryOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSyncQuickInfo={() => syncFlow.setSyncQuickInfoOpen(true)}
        />

        <WorkoutDayStack
          tokens={derived.tokens}
          weightUnit={derived.weightUnit}
          dayConfigs={derived.dayConfigs}
          workouts={derived.workouts}
          selectedDay={derived.selectedDay}
          program={derived.program}
          currentWeek={derived.currentWeek}
          weekConfigs={derived.weekConfigs}
          userExerciseSettings={derived.userExerciseSettings}
          restDuration={derived.restDuration}
          getAdjustedWeight={derived.getAdjustedWeight}
          suggestedDayName={derived.suggestedDay?.name ?? null}
          onWeekChange={workoutActions.handleWeekChange}
          onOpenProgramSettings={() => setProgramSettingsOpen(true)}
          onOpenProgressionSuggestions={() =>
            setProgressionSuggestionsOpen(true)
          }
          onOpenWorkoutLog={() => setWorkoutLogOpen(true)}
          pendingProgressionSuggestionCount={progressionSuggestions.length}
          onOpenAddExercise={workoutActions.handleOpenAdd}
          onOpenExerciseSettings={(exercise) => {
            setExerciseSettingsTarget(exercise);
            setExerciseSettingsOpen(true);
          }}
          onApplyRestPreset={(restSeconds) => {
            setRestTimerPresetDuration(restSeconds);
            setRestTimerOpenRequest((value) => value + 1);
          }}
          onEditExercise={workoutActions.handleOpenEdit}
          onDeleteExercise={workoutActions.handleDeleteExercise}
          onAdjustWeight={workoutActions.handleAdjustWeight}
          onSetWeight={workoutActions.handleSetWeight}
          onReorderExercises={workoutActions.handleReorderExercises}
          contentBottomPadding={
            derived.layout.contentBottomPadding + (timerExpanded ? 260 : 0)
          }
          fabBottom={derived.layout.workoutFabBottom}
          contentMaxWidth={responsiveLayout.contentMaxWidth}
          exerciseColumns={responsiveLayout.exerciseColumns}
        />

        <RestTimer
          tokens={derived.tokens}
          duration={derived.restDuration}
          presetDuration={restTimerPresetDuration}
          openRequest={restTimerOpenRequest}
          onDurationChange={workoutActions.handleRestDurationChange}
          fabBottom={derived.layout.timerFabBottom}
          panelBottom={derived.layout.timerPanelBottom}
          onExpandedChange={setTimerExpanded}
        />

        <Navigation
          tokens={derived.tokens}
          currentDay={derived.selectedDay}
          dayConfigs={derived.dayConfigs}
          onDayChange={(nextDay) =>
            workoutActions.handleDayChange(nextDay, derived.selectedDay)
          }
          bottomPadding={derived.layout.navBottomPadding}
          minHeight={derived.layout.navHeight}
        />

        <AddExerciseModal
          open={exerciseModalOpen}
          mode={exerciseModalMode}
          tokens={derived.tokens}
          weightUnit={derived.weightUnit}
          initialExercise={workoutActions.editingExercise}
          initialSettings={
            workoutActions.editingExercise
              ? (derived.userExerciseSettings[
                  workoutActions.editingExercise.id
                ] ?? null)
              : null
          }
          onClose={() => setExerciseModalOpen(false)}
          onSubmit={(payload) => {
            void workoutActions
              .handleExerciseSubmit(payload.exercise)
              .then(() => {
                if (payload.settings) {
                  return handleSaveExerciseSettings(payload.settings);
                }
              });
          }}
        />

        <WorkoutLogModal
          open={workoutLogOpen}
          tokens={derived.tokens}
          workout={derived.currentWorkout}
          program={derived.program}
          currentWeek={derived.currentWeek}
          weekRir={
            derived.weekConfigs.find((item) => item.id === derived.currentWeek)
              ?.rir ?? null
          }
          restDuration={derived.restDuration}
          weightUnit={derived.weightUnit}
          getAdjustedWeight={derived.getAdjustedWeight}
          onClose={() => setWorkoutLogOpen(false)}
          onSave={handleWorkoutLogSave}
        />

        <ExerciseSettingsModal
          open={exerciseSettingsOpen}
          tokens={derived.tokens}
          exercise={exerciseSettingsTarget}
          weightUnit={derived.weightUnit}
          initialSettings={
            exerciseSettingsTarget
              ? (derived.userExerciseSettings[exerciseSettingsTarget.id] ??
                null)
              : null
          }
          onClose={() => {
            setExerciseSettingsOpen(false);
            setExerciseSettingsTarget(null);
          }}
          onSave={(settings) => {
            void handleSaveExerciseSettings(settings);
          }}
        />

        <ProgressionSuggestionsModal
          open={progressionSuggestionsOpen}
          tokens={derived.tokens}
          suggestions={progressionSuggestions}
          weightUnit={derived.weightUnit}
          onClose={() => setProgressionSuggestionsOpen(false)}
          onApply={(suggestionId, nextWeightKg) => {
            void handleApplyProgressionSuggestion(suggestionId, nextWeightKg);
          }}
          onSkip={handleSkipProgressionSuggestion}
        />

        <ProgramSettingsModal
          open={programSettingsOpen}
          tokens={derived.tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          program={derived.program}
          weekConfigs={derived.weekConfigs}
          dayConfigs={derived.dayConfigs}
          workouts={derived.workouts}
          onClose={() => setProgramSettingsOpen(false)}
          onProgramChange={(updates) => {
            void applyWorkoutMutation({
              type: 'setProgramMetadata',
              updates,
            });
          }}
          onWeekConfigsChange={(nextWeekConfigs) => {
            void applyWorkoutMutation({
              type: 'replaceWeekConfigs',
              weekConfigs: nextWeekConfigs,
            });
          }}
          onDayConfigsChange={(nextDayConfigs) => {
            void applyWorkoutMutation({
              type: 'replaceDayConfigs',
              dayConfigs: nextDayConfigs,
            });
          }}
          onWorkoutDefaultRestChange={(workoutId, defaultRestSeconds) => {
            void applyWorkoutMutation({
              type: 'setWorkoutDefaultRest',
              workoutId,
              defaultRestSeconds,
            });
          }}
          onPrompt={showPrompt}
        />

        <ImportPreviewModal
          open={backupFlow.importPreviewOpen}
          tokens={derived.tokens}
          summary={backupFlow.importSummary}
          onClose={backupFlow.handleCancelImport}
          onImportAsNewProgram={() => {
            void backupFlow.handleImportAsNewProgram();
          }}
          onReplaceActiveProgram={() => {
            void backupFlow.handleReplaceActiveProgram();
          }}
        />

        <ProgramLibraryModal
          open={programLibraryOpen}
          tokens={derived.tokens}
          programs={derived.availablePrograms}
          onClose={() => setProgramLibraryOpen(false)}
          onSelectProgram={(programId) => {
            if (programId === derived.program?.id) {
              setProgramLibraryOpen(false);
              return;
            }
            void setActiveProgram(programId)
              .then(() => {
                setProgramLibraryOpen(false);
              })
              .catch((error) => {
                logError('program-library/switch failed', error);
                showPrompt('Program switch failed', getErrorMessage(error));
              });
          }}
        />

        <SettingsModal
          open={settingsOpen}
          tokens={derived.tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          appName={APP_CONFIG.name}
          appVersion={APP_CONFIG.version}
          appBuild={APP_CONFIG.buildNumber ?? 'N/A'}
          buildType={APP_CONFIG.buildType}
          themePreference={derived.themePreference}
          systemThemeMode={systemThemeMode}
          onThemePreferenceChange={settingsFlow.handleThemeModeChange}
          weightUnit={derived.weightUnit}
          onWeightUnitChange={settingsFlow.handleWeightUnitChange}
          language={derived.currentLanguage}
          onLanguageChange={settingsFlow.handleLanguageChange}
          onLanguageListOpen={() => setLanguageListOpen(true)}
          syncState={syncState}
          syncHealth={syncHealth}
          pairedDevices={pairedDevices}
          localDeviceDisplayName={localDeviceDisplayName}
          masterKey={syncFlow.syncMasterKey}
          onToggleSync={syncFlow.handleToggleSync}
          onOpenCreateRoom={() => {
            void syncFlow.handleOpenCreateRoom();
          }}
          onOpenJoinRoom={() => syncFlow.setJoinRoomOpen(true)}
          onShowSyncQR={() => void syncFlow.handleShowSyncQRCode()}
          onApplyMasterKey={syncFlow.handleApplyMasterKey}
          onRenameLocalDevice={syncFlow.renameLocalDevice}
          onCopyMasterKey={syncFlow.handleCopyMasterKey}
          onForgetDevice={async (deviceId) => {
            syncFlow.handleForgetPairedDevice(deviceId);
          }}
          onLeaveRoom={async () => {
            syncFlow.handleLeaveSyncRoom();
          }}
          onOpenDebug={() => setSyncDebugOpen(true)}
          onOpenLocalBackup={backupFlow.handleOpenLocalBackup}
          onOpenQRBackup={backupFlow.handleOpenQRBackup}
          onResetData={settingsFlow.handleResetData}
          onClose={() => {
            setSettingsOpen(false);
            syncFlow.setSettingsSyncExpanded(false);
          }}
          onOpenGithub={settingsFlow.handleOpenGithub}
          defaultSyncExpanded={syncFlow.settingsSyncExpanded}
        />

        <SyncQuickInfoModal
          open={syncFlow.syncQuickInfoOpen}
          tokens={derived.tokens}
          syncHealth={syncHealth}
          onMore={() => {
            syncFlow.setSyncQuickInfoOpen(false);
            syncFlow.setSettingsSyncExpanded(true);
            setSettingsOpen(true);
          }}
          onClose={() => {
            syncFlow.setSyncQuickInfoOpen(false);
          }}
        />

        {sharedSyncModals}

        <SyncDebugInfoModal
          open={syncDebugOpen}
          tokens={derived.tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          syncHealth={syncHealth}
          syncState={syncState}
          pairedDevices={pairedDevices}
          localDeviceDisplayName={localDeviceDisplayName}
          logEntries={syncLogs}
          onRefresh={syncFlow.handleRefreshSync}
          onClearLogs={() => {
            syncFlow.clearRecentLogs();
            void refreshSyncLogs();
          }}
          onClose={() => setSyncDebugOpen(false)}
        />

        <ShareToDeviceModal
          open={backupFlow.shareToDeviceOpen}
          tokens={derived.tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          backupCollection={backupFlow.shareTransferCollection}
          onClose={backupFlow.handleCloseShareToDevice}
        />

        <ScanFromDeviceModal
          open={backupFlow.scanFromDeviceOpen}
          tokens={derived.tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          onScanPayload={backupFlow.handleScanPayload}
          onClose={() => backupFlow.setScanFromDeviceOpen(false)}
        />

        <BackupActionModal
          open={backupFlow.backupActionMode != null}
          mode={backupFlow.backupActionMode}
          tokens={derived.tokens}
          onExportLocalBackup={() => void backupFlow.exportBackup('save')}
          onImportLocalBackup={() => void backupFlow.handleImportBackup()}
          onShareBackup={() => void backupFlow.exportBackup('share')}
          onShareToDevice={() => void backupFlow.handleOpenShareToDevice()}
          onScanFromDevice={() => backupFlow.setScanFromDeviceOpen(true)}
          onClose={() => backupFlow.setBackupActionMode(null)}
        />

        <LanguageListModal
          open={languageListOpen}
          tokens={derived.tokens}
          selectedLanguage={derived.currentLanguage}
          onClose={() => setLanguageListOpen(false)}
          onSelectLanguage={settingsFlow.handleLanguageChange}
        />

        <AppPromptModal
          open={Boolean(promptConfig)}
          tokens={derived.tokens}
          title={promptConfig?.title ?? ''}
          message={promptConfig?.message ?? ''}
          actions={promptConfig?.actions ?? [{ label: 'OK' }]}
          onClose={closePrompt}
        />
      </View>
    </SafeAreaView>
  );
}
