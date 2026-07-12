import { describe, expect, test } from 'bun:test';
import {
  formatFrequencySummarySummary,
  getWeekTitle,
  hasNamedWeekConfigs,
  normalizeFrequencySummaryEntries,
  resolveAppliedLoadModifier,
} from '@/utils/program';

describe('program helpers', () => {
  test('normalizes and filters frequency targets', () => {
    expect(
      normalizeFrequencySummaryEntries([
        { muscleGroup: ' Chest ', targetPerWeek: 2.2 },
        { muscleGroup: '', targetPerWeek: 3 },
        { muscleGroup: 'Back', targetPerWeek: 0 },
      ]),
    ).toEqual([{ muscleGroup: 'Chest', targetPerWeek: 2 }]);
  });

  test('returns undefined when no valid frequency target remains', () => {
    expect(
      normalizeFrequencySummaryEntries([
        { muscleGroup: ' ', targetPerWeek: 2 },
        { muscleGroup: 'Chest', targetPerWeek: 0 },
      ]),
    ).toBe(undefined);
  });

  test('formats weekly target summaries for compact display', () => {
    expect(
      formatFrequencySummarySummary([
        { muscleGroup: 'Chest', targetPerWeek: 2 },
        { muscleGroup: 'Back', targetPerWeek: 2.2 },
      ]),
    ).toBe('Chest 2x · Back 2x');
    expect(formatFrequencySummarySummary([])).toBe(null);
  });

  test('applies week load modifiers only for simple load-modifier programs', () => {
    expect(
      resolveAppliedLoadModifier({
        progressionModel: 'simple_load_modifier',
        loadModifier: 1.05,
      }),
    ).toBe(1.05);
    expect(
      resolveAppliedLoadModifier({
        progressionModel: 'mixed',
        loadModifier: 0.9,
      }),
    ).toBe(1);
    expect(
      resolveAppliedLoadModifier({
        progressionModel: 'exercise_rules',
        loadModifier: 1.1,
      }),
    ).toBe(1);
    expect(
      resolveAppliedLoadModifier({
        progressionModel: 'manual',
        loadModifier: 0.95,
      }),
    ).toBe(1);
  });

  test('detects whether week configs are actually named', () => {
    expect(hasNamedWeekConfigs([{ name: 'Week 1' }, { name: 'Week 2' }])).toBe(
      true,
    );
    expect(hasNamedWeekConfigs([{ name: '' }, { name: '   ' }])).toBe(false);
  });

  test('falls back to a generic week title when a name is blank', () => {
    expect(getWeekTitle({ id: 1, name: 'Accumulation' }, 1)).toBe(
      'Accumulation',
    );
    expect(getWeekTitle({ id: 2, name: '   ' }, 2)).toBe('Week 2');
    expect(getWeekTitle(undefined, 3)).toBe('Week 3');
  });
});
