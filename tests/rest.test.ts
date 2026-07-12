import { describe, expect, test } from 'bun:test';
import { getRestSeconds, shouldShowRestChip } from '@/utils/rest';

describe('rest helpers', () => {
  test('prefers exercise rest over program and settings defaults', () => {
    expect(
      getRestSeconds({
        exercise: {
          advanced: {
            restSeconds: 180,
          },
        },
        workout: {
          defaultRestSeconds: 150,
        },
        program: {
          defaultRestSeconds: 120,
        },
        settingsRestSeconds: 90,
      }),
    ).toBe(180);
  });

  test('falls back to workout, then program, then settings, then app default', () => {
    expect(
      getRestSeconds({
        workout: {
          defaultRestSeconds: 135,
        },
        program: {
          defaultRestSeconds: 120,
        },
        settingsRestSeconds: 90,
      }),
    ).toBe(135);

    expect(
      getRestSeconds({
        program: {
          defaultRestSeconds: 120,
        },
        settingsRestSeconds: 90,
      }),
    ).toBe(120);

    expect(
      getRestSeconds({
        settingsRestSeconds: 90,
      }),
    ).toBe(90);

    expect(getRestSeconds({})).toBe(150);
  });

  test('shows the rest chip only when rest is informative', () => {
    expect(shouldShowRestChip({})).toBe(false);
    expect(shouldShowRestChip({ settingsRestSeconds: 150 })).toBe(false);
    expect(shouldShowRestChip({ settingsRestSeconds: 180 })).toBe(true);
    expect(
      shouldShowRestChip({
        workout: {
          defaultRestSeconds: 150,
        },
      }),
    ).toBe(true);
    expect(
      shouldShowRestChip({
        exercise: {
          advanced: {
            restSeconds: 90,
          },
        },
      }),
    ).toBe(true);
  });
});
