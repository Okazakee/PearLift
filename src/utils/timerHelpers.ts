import type { PersistedRestTimerStateV1, RestTimerMode } from '../types/timer';

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
