import type { ThemeTokens } from '@/theme/tokens';

export type RestTimerMode = 'idle' | 'running' | 'paused' | 'complete';

export interface RestTimerProps {
  tokens: ThemeTokens;
  duration: number;
  onDurationChange: (duration: number) => void;
  fabBottom: number;
  panelBottom: number;
  onExpandedChange?: (isOpen: boolean) => void;
}

export type PersistedRestTimerStateV1 = {
  v: 1;
  mode: RestTimerMode;
  endAtMs: number | null;
  remainingSec: number;
  startedDurationSec: number;
  scheduledNotificationId: string | null;
};
