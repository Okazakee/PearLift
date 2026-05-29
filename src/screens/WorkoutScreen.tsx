import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
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
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import i18n, { SUPPORTED_I18N_LANGUAGE_CODES } from '@/i18n';
import { useSystemLanguage } from '@/i18n/systemLanguage';
import { styles } from '@/screens/styles';
import {
  applyWorkoutMutation,
  closePrompt,
  refreshSyncLogs,
  showPrompt,
} from '@/screens/workout/services';
import { useBackupFlow } from '@/screens/workout/useBackupFlow';
import { useSettingsFlow } from '@/screens/workout/useSettingsFlow';
import { useSyncFlow } from '@/screens/workout/useSyncFlow';
import { useWorkoutActions } from '@/screens/workout/useWorkoutActions';
import { useWorkoutBootstrap } from '@/screens/workout/useWorkoutBootstrap';
import { useWorkoutDerivedState } from '@/screens/workout/useWorkoutDerivedState';
import { useImportStore } from '@/store/importStore';
import { useSyncStore } from '@/store/syncStore';
import { useWorkoutDataStore } from '@/store/workoutDataStore';
import { useWorkoutUiStore } from '@/store/workoutUiStore';
import type { ThemeMode } from '@/theme/tokens';

export function WorkoutScreen() {
  useWorkoutBootstrap();

  const insets = useSafeAreaInsets();
  const responsiveLayout = useResponsiveLayout();
  const systemScheme = useColorScheme();
  const systemLanguage = useSystemLanguage(SUPPORTED_I18N_LANGUAGE_CODES, 'en');

  const snapshot = useWorkoutDataStore((state) => state.snapshot);
  const isReady = useWorkoutDataStore((state) => state.isReady);
  const syncHealth = useSyncStore((state) => state.syncHealth);
  const syncState = useSyncStore((state) => state.syncState);
  const pairedDevices = useSyncStore((state) => state.pairedDevices);
  const localDeviceDisplayName = useSyncStore(
    (state) => state.localDeviceDisplayName,
  );
  const syncLogs = useSyncStore((state) => state.syncLogs);
  const importSummary = useImportStore((state) => state.importSummary);
  const promptConfig = useWorkoutUiStore((state) => state.promptConfig);
  const exerciseModalOpen = useWorkoutUiStore(
    (state) => state.exerciseModalOpen,
  );
  const exerciseModalMode = useWorkoutUiStore(
    (state) => state.exerciseModalMode,
  );
  const programSettingsOpen = useWorkoutUiStore(
    (state) => state.programSettingsOpen,
  );
  const settingsOpen = useWorkoutUiStore((state) => state.settingsOpen);
  const syncDebugOpen = useWorkoutUiStore((state) => state.syncDebugOpen);
  const languageListOpen = useWorkoutUiStore((state) => state.languageListOpen);
  const importPreviewOpen = useWorkoutUiStore(
    (state) => state.importPreviewOpen,
  );
  const timerExpanded = useWorkoutUiStore((state) => state.timerExpanded);
  const ui = useWorkoutUiStore();

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
  });
  const settingsFlow = useSettingsFlow(systemLanguage);
  const backupFlow = useBackupFlow();
  const syncFlow = useSyncFlow();

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
          syncHealth={syncHealth}
          onOpenSettings={() => ui.setSettingsOpen(true)}
          onOpenSyncQuickInfo={() => syncFlow.setSyncQuickInfoOpen(true)}
        />

        <WorkoutDayStack
          tokens={derived.tokens}
          weightUnit={derived.weightUnit}
          dayConfigs={derived.dayConfigs}
          workouts={derived.workouts}
          selectedDay={derived.selectedDay}
          currentWeek={derived.currentWeek}
          weekConfigs={derived.weekConfigs}
          userWeights={derived.userWeights}
          getAdjustedWeight={derived.getAdjustedWeight}
          onWeekChange={workoutActions.handleWeekChange}
          onOpenProgramSettings={() => ui.setProgramSettingsOpen(true)}
          onOpenAddExercise={workoutActions.handleOpenAdd}
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
          onDurationChange={workoutActions.handleRestDurationChange}
          fabBottom={derived.layout.timerFabBottom}
          panelBottom={derived.layout.timerPanelBottom}
          onExpandedChange={ui.setTimerExpanded}
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
          initialExercise={workoutActions.editingExercise}
          onClose={() => ui.setExerciseModalOpen(false)}
          onSubmit={(payload) => {
            void workoutActions.handleExerciseSubmit(payload);
          }}
        />

        <ProgramSettingsModal
          open={programSettingsOpen}
          tokens={derived.tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          weekConfigs={derived.weekConfigs}
          dayConfigs={derived.dayConfigs}
          onClose={() => ui.setProgramSettingsOpen(false)}
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
          onPrompt={showPrompt}
        />

        <ImportPreviewModal
          open={importPreviewOpen}
          tokens={derived.tokens}
          summary={importSummary}
          onClose={backupFlow.handleCancelImport}
          onConfirm={() => {
            void backupFlow.handleConfirmImport();
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
          onLanguageListOpen={() => ui.setLanguageListOpen(true)}
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
          onOpenDebug={() => ui.setSyncDebugOpen(true)}
          onOpenLocalBackup={backupFlow.handleOpenLocalBackup}
          onOpenQRBackup={backupFlow.handleOpenQRBackup}
          onResetData={settingsFlow.handleResetData}
          onClose={() => {
            ui.setSettingsOpen(false);
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
            ui.setSettingsOpen(true);
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
          onClose={() => ui.setSyncDebugOpen(false)}
        />

        <ShareToDeviceModal
          open={backupFlow.shareToDeviceOpen}
          tokens={derived.tokens}
          topInset={insets.top}
          bottomInset={insets.bottom}
          runtimeState={snapshot}
          onClose={() => backupFlow.setShareToDeviceOpen(false)}
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
          onShareToDevice={() => backupFlow.setShareToDeviceOpen(true)}
          onScanFromDevice={() => backupFlow.setScanFromDeviceOpen(true)}
          onClose={() => backupFlow.setBackupActionMode(null)}
        />

        <LanguageListModal
          open={languageListOpen}
          tokens={derived.tokens}
          selectedLanguage={derived.currentLanguage}
          onClose={() => ui.setLanguageListOpen(false)}
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
