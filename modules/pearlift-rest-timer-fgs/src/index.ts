import { requireOptionalNativeModule } from 'expo';

type ServiceMode = 'idle' | 'running' | 'paused';

export type RestTimerNotificationText = {
  runningTitle: string;
  runningPrefix: string;
  pausedPrefix: string;
  completionTitle: string;
  completionBody: string;
  pauseActionLabel: string;
  resumeActionLabel: string;
  stopActionLabel: string;
};

export type RestTimerForegroundServiceState = {
  mode: ServiceMode;
  endAtMs?: number;
  remainingSec?: number;
  startedDurationSec?: number;
  completedAtMs?: number;
};

type NativeApi = {
  start(
    endAtMs: number,
    startedDurationSec: number,
    notificationText: RestTimerNotificationText,
  ): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>; // handoff: stop FGS + notification, keep state
  cancel(): Promise<void>; // cancel/reset
  getState(): Promise<RestTimerForegroundServiceState>;
  clearCompletion(): Promise<void>;
};

// Name must match the Kotlin ModuleDefinition Name(...).
const Native = requireOptionalNativeModule<NativeApi>(
  'RestTimerForegroundService',
);

export const RestTimerForegroundService = Native;
