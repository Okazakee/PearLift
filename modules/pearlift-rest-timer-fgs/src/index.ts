import { requireOptionalNativeModule } from 'expo-modules-core';

type ServiceMode = 'idle' | 'running' | 'paused';

export type RestTimerForegroundServiceState = {
  mode: ServiceMode;
  endAtMs?: number;
  remainingSec?: number;
  startedDurationSec?: number;
  completedAtMs?: number;
};

type NativeApi = {
  start(endAtMs: number, startedDurationSec: number): Promise<void>;
  pause(): Promise<void>;
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
