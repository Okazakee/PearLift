import { describe, expect, test } from 'bun:test';
import { MAX_DURATION, MIN_DURATION } from '@/config/timer';
import { adjustRestTimerDuration } from '@/utils/timerHelpers';

describe('adjustRestTimerDuration', () => {
  test('keeps workout rest overrides local while running', () => {
    const result = adjustRestTimerDuration({
      mode: 'running',
      configuredDuration: 180,
      startedDurationSec: 180,
      endAtMs: 91_000,
      delta: 15,
      nowMs: 1_000,
    });

    expect(result).toEqual({
      mode: 'running',
      configuredDuration: 195,
      remainingSec: 105,
      startedDurationSec: 195,
      endAtMs: 106_000,
      persistDefaultDuration: false,
      rescheduleNotification: true,
    });
  });

  test('updates only the paused timer snapshot without persisting defaults', () => {
    const result = adjustRestTimerDuration({
      mode: 'paused',
      configuredDuration: 150,
      startedDurationSec: 150,
      endAtMs: null,
      delta: -15,
    });

    expect(result).toEqual({
      mode: 'paused',
      configuredDuration: 135,
      remainingSec: 135,
      startedDurationSec: 135,
      endAtMs: null,
      persistDefaultDuration: false,
      rescheduleNotification: false,
    });
  });

  test('persists the default duration only while idle or complete', () => {
    const idleResult = adjustRestTimerDuration({
      mode: 'idle',
      configuredDuration: 150,
      startedDurationSec: 150,
      endAtMs: null,
      delta: 15,
    });
    const completeResult = adjustRestTimerDuration({
      mode: 'complete',
      configuredDuration: 150,
      startedDurationSec: 150,
      endAtMs: null,
      delta: -15,
    });

    expect(idleResult.persistDefaultDuration).toBe(true);
    expect(idleResult.mode).toBe('idle');
    expect(idleResult.remainingSec).toBe(165);
    expect(completeResult.persistDefaultDuration).toBe(true);
    expect(completeResult.mode).toBe('idle');
    expect(completeResult.remainingSec).toBe(135);
  });

  test('clamps duration changes to timer bounds', () => {
    const minResult = adjustRestTimerDuration({
      mode: 'idle',
      configuredDuration: MIN_DURATION,
      startedDurationSec: MIN_DURATION,
      endAtMs: null,
      delta: -15,
    });
    const maxResult = adjustRestTimerDuration({
      mode: 'idle',
      configuredDuration: MAX_DURATION,
      startedDurationSec: MAX_DURATION,
      endAtMs: null,
      delta: 15,
    });

    expect(minResult.configuredDuration).toBe(MIN_DURATION);
    expect(maxResult.configuredDuration).toBe(MAX_DURATION);
  });
});
