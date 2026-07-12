import { describe, expect, test } from 'bun:test';
import {
  fromDisplayWeight,
  removeLoadModifier,
  toDisplayWeight,
} from '@/utils/units';

describe('unit helpers', () => {
  test('converts a displayed week-adjusted weight back to stored kg', () => {
    expect(
      Math.abs(removeLoadModifier(fromDisplayWeight(66, 'kg'), 1.1) - 60) <
        0.000001,
    ).toBe(true);
    expect(
      Math.abs(
        removeLoadModifier(
          fromDisplayWeight(toDisplayWeight(66, 'lb'), 'lb'),
          1.1,
        ) - 60,
      ) < 0.000001,
    ).toBe(true);
  });

  test('converts displayed weight deltas back to stored deltas', () => {
    expect(removeLoadModifier(fromDisplayWeight(2.5, 'kg'), 1.25)).toBe(2);
    expect(
      Math.abs(
        removeLoadModifier(fromDisplayWeight(5, 'lb'), 1.1) - 2.0617835,
      ) < 0.000001,
    ).toBe(true);
  });

  test('falls back to a neutral modifier when the input is invalid', () => {
    expect(removeLoadModifier(60, 0)).toBe(60);
    expect(removeLoadModifier(60, null)).toBe(60);
  });
});
