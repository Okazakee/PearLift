import { MAX_DURATION, MIN_DURATION } from '@/config/timer';
import type { PersistedRestTimerStateV1, RestTimerMode } from '@/types/timer';

export function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function computeRemainingSeconds(endAtMs: number): number {
  const diffMs = endAtMs - Date.now();
  return Math.max(0, Math.ceil(diffMs / 1000));
}

export function safeParsePersistedState(
  raw: string | null,
): PersistedRestTimerStateV1 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedRestTimerStateV1>;
    if (parsed?.v !== 1) return null;
    if (
      parsed.mode !== 'idle' &&
      parsed.mode !== 'running' &&
      parsed.mode !== 'paused' &&
      parsed.mode !== 'complete'
    )
      return null;
    if (
      typeof parsed.remainingSec !== 'number' ||
      !Number.isFinite(parsed.remainingSec)
    ) {
      return null;
    }
    if (
      typeof parsed.startedDurationSec !== 'number' ||
      !Number.isFinite(parsed.startedDurationSec)
    ) {
      return null;
    }
    const endAtMs =
      parsed.endAtMs === null ||
      (typeof parsed.endAtMs === 'number' && Number.isFinite(parsed.endAtMs))
        ? (parsed.endAtMs ?? null)
        : null;
    const scheduledNotificationId =
      parsed.scheduledNotificationId === null ||
      typeof parsed.scheduledNotificationId === 'string'
        ? (parsed.scheduledNotificationId ?? null)
        : null;

    return {
      v: 1,
      mode: parsed.mode as RestTimerMode,
      endAtMs: endAtMs,
      remainingSec: Math.max(0, Math.round(parsed.remainingSec)),
      startedDurationSec: Math.max(0, Math.round(parsed.startedDurationSec)),
      scheduledNotificationId: scheduledNotificationId,
    };
  } catch {
    return null;
  }
}

interface AdjustRestTimerDurationInput {
  mode: RestTimerMode;
  configuredDuration: number;
  startedDurationSec: number;
  endAtMs: number | null;
  delta: number;
  nowMs?: number;
}

interface AdjustRestTimerDurationResult {
  mode: RestTimerMode;
  configuredDuration: number;
  remainingSec: number;
  startedDurationSec: number;
  endAtMs: number | null;
  persistDefaultDuration: boolean;
  rescheduleNotification: boolean;
}

export function adjustRestTimerDuration(
  input: AdjustRestTimerDurationInput,
): AdjustRestTimerDurationResult {
  const configuredDuration = Math.max(
    MIN_DURATION,
    Math.min(MAX_DURATION, input.configuredDuration + input.delta),
  );
  const durationDelta = configuredDuration - input.configuredDuration;

  if (input.mode === 'running' && input.endAtMs != null) {
    const nextEndAtMs = input.endAtMs + durationDelta * 1000;
    const nowMs = input.nowMs ?? Date.now();
    return {
      mode: 'running',
      configuredDuration,
      remainingSec: Math.max(0, Math.ceil((nextEndAtMs - nowMs) / 1000)),
      startedDurationSec: Math.max(
        MIN_DURATION,
        input.startedDurationSec + durationDelta,
      ),
      endAtMs: nextEndAtMs,
      persistDefaultDuration: false,
      rescheduleNotification: true,
    };
  }

  if (input.mode === 'paused') {
    return {
      mode: 'paused',
      configuredDuration,
      remainingSec: configuredDuration,
      startedDurationSec: configuredDuration,
      endAtMs: null,
      persistDefaultDuration: false,
      rescheduleNotification: false,
    };
  }

  return {
    mode: input.mode === 'complete' ? 'idle' : input.mode,
    configuredDuration,
    remainingSec: configuredDuration,
    startedDurationSec: configuredDuration,
    endAtMs: null,
    persistDefaultDuration: true,
    rescheduleNotification: false,
  };
}
