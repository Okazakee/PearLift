function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const E2E_IDS = {
  header: {
    settingsOpen: 'settings.open',
    syncStatusOpen: 'sync.status.open',
  },
  onboarding: {
    next: 'onboarding.next',
    back: 'onboarding.back',
    unitKg: 'onboarding.unit.kg',
    unitLb: 'onboarding.unit.lb',
    syncCreate: 'onboarding.sync.create',
    syncJoin: 'onboarding.sync.join',
    syncSkip: 'onboarding.sync.skip',
  },
  navigation: {
    day: (dayId: string) => `navigation.day.${dayId}`,
  },
  workout: {
    addExercise: 'workout.addExercise',
    programSettings: 'workout.programSettings',
    weekTab: (weekId: number) => `workout.week.${weekId}`,
  },
  programSettings: {
    close: 'programSettings.close',
    tabWeeks: 'programSettings.tab.weeks',
    tabDays: 'programSettings.tab.days',
    weekCard: (weekId: number) => `programSettings.week.${weekId}.card`,
    weekName: (weekId: number) => `programSettings.week.${weekId}.name`,
    weekDelete: (weekId: number) => `programSettings.week.${weekId}.delete`,
    weekLoadDecrement: (weekId: number) =>
      `programSettings.week.${weekId}.load.decrement`,
    weekLoadValue: (weekId: number) =>
      `programSettings.week.${weekId}.load.value`,
    weekLoadIncrement: (weekId: number) =>
      `programSettings.week.${weekId}.load.increment`,
    weekRir: (weekId: number, value: number) =>
      `programSettings.week.${weekId}.rir.${value}`,
    addWeek: 'programSettings.week.add',
    dayCard: (dayId: string) => `programSettings.day.${dayId}.card`,
    dayName: (dayId: string) => `programSettings.day.${dayId}.name`,
    dayDelete: (dayId: string) => `programSettings.day.${dayId}.delete`,
    dayIcon: (dayId: string, icon: string) =>
      `programSettings.day.${dayId}.icon.${slugify(icon)}`,
    addDay: 'programSettings.day.add',
  },
  exercise: {
    card: (exerciseId: string) => `exercise.${exerciseId}.card`,
    edit: (exerciseId: string) => `exercise.${exerciseId}.edit`,
    delete: (exerciseId: string) => `exercise.${exerciseId}.delete`,
    decrement: (exerciseId: string) => `exercise.${exerciseId}.decrement`,
    increment: (exerciseId: string) => `exercise.${exerciseId}.increment`,
    weightInput: (exerciseId: string) => `exercise.${exerciseId}.weightInput`,
    weightValue: (exerciseId: string) => `exercise.${exerciseId}.weightValue`,
  },
  exerciseModal: {
    close: 'exercise.modal.close',
    name: 'exercise.modal.name',
    sets: 'exercise.modal.sets',
    reps: 'exercise.modal.reps',
    notes: 'exercise.modal.notes',
    submit: 'exercise.modal.submit',
    muscleGroup: (muscleGroup: string) =>
      `exercise.modal.muscleGroup.${slugify(muscleGroup)}`,
  },
  settings: {
    close: 'settings.close',
    themeSystem: 'settings.theme.system',
    themeLight: 'settings.theme.light',
    themeDark: 'settings.theme.dark',
    weightKg: 'settings.weightUnit.kg',
    weightLb: 'settings.weightUnit.lb',
    languageOpen: 'settings.language.open',
    localBackupOpen: 'settings.data.localBackup',
    qrBackupOpen: 'settings.data.qrBackup',
    resetData: 'settings.data.reset',
    githubOpen: 'settings.github.open',
    syncExpand: 'settings.sync.expand',
    syncToggle: 'settings.sync.toggle',
    syncCreate: 'settings.sync.create',
    syncJoin: 'settings.sync.join',
    syncShowQr: 'settings.sync.showQr',
    syncRenameDevice: 'settings.sync.renameDevice',
    syncDeviceName: 'settings.sync.deviceName',
    syncCopyKey: 'settings.sync.copyKey',
    syncApplyKey: 'settings.sync.applyKey',
    syncMasterKey: 'settings.sync.masterKey',
    syncLeave: 'settings.sync.leave',
    syncDebug: 'settings.sync.debug',
    syncAdvanced: 'settings.sync.advanced',
  },
  languageList: {
    close: 'settings.language.close',
    option: (languageCode: string) =>
      `settings.language.option.${languageCode}`,
  },
  prompt: {
    cancel: 'prompt.action.cancel',
    default: 'prompt.action.default',
    destructive: 'prompt.action.destructive',
  },
  restTimer: {
    open: 'restTimer.open',
    close: 'restTimer.close',
    startPause: 'restTimer.startPause',
    reset: 'restTimer.reset',
    settings: 'restTimer.settings',
    decrementDuration: 'restTimer.duration.decrement',
    incrementDuration: 'restTimer.duration.increment',
  },
  syncCreate: {
    inviteText: 'sync.create.inviteText',
    pairingSecret: 'sync.create.pairingSecret',
    bootstrapKey: 'sync.create.bootstrapKey',
    copy: 'sync.create.copy',
    close: 'sync.create.close',
  },
  syncJoin: {
    input: 'sync.join.input',
    paste: 'sync.join.paste',
    join: 'sync.join.submit',
    scan: 'sync.join.scan',
    close: 'sync.join.close',
  },
  backupActions: {
    close: 'backup.actions.close',
    localExport: 'backup.actions.local.export',
    localImport: 'backup.actions.local.import',
    localShare: 'backup.actions.local.share',
    shareToDevice: 'backup.actions.qr.shareToDevice',
    scanFromDevice: 'backup.actions.qr.scanFromDevice',
  },
  shareToDevice: {
    close: 'backup.shareToDevice.close',
    qrContainer: 'backup.shareToDevice.qr',
    previous: 'backup.shareToDevice.previous',
    next: 'backup.shareToDevice.next',
    pause: 'backup.shareToDevice.pause',
  },
  syncDebug: {
    close: 'syncDebug.close',
    clear: 'syncDebug.clear',
    refresh: 'syncDebug.refresh',
    copySnapshot: 'syncDebug.copySnapshot',
    copyLogs: 'syncDebug.copyLogs',
    rawSnapshot: 'syncDebug.rawSnapshot',
    rawLogs: 'syncDebug.rawLogs',
    roomStateValue: 'syncDebug.value.roomState',
    firstSyncResolutionValue: 'syncDebug.value.firstSyncResolution',
    pairedDeviceNamesValue: 'syncDebug.value.pairedDeviceNames',
    autobaseKeyValue: 'syncDebug.value.autobaseKey',
    topicHexValue: 'syncDebug.value.topicHex',
    lastErrorValue: 'syncDebug.value.lastError',
    recentLogKeysValue: 'syncDebug.value.recentLogKeys',
    filter: (value: 'all' | 'info' | 'warn' | 'error') =>
      `syncDebug.filter.${value}`,
    summarySection: 'syncDebug.summary',
    logsSection: 'syncDebug.logs',
  },
} as const;
