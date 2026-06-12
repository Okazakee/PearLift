export type RestTimerMode = 'idle' | 'running' | 'paused' | 'complete';

export type PersistedRestTimerStateV1 = {
  v: 1;
  mode: RestTimerMode;
  endAtMs: number | null;
  remainingSec: number;
  startedDurationSec: number;
  scheduledNotificationId: string | null;
};
