import { describe, expect, test } from 'bun:test';
import {
  buildUserExerciseSettings,
  buildWorkingWeightSettingUpdate,
  formatExerciseSettingInputValue,
  formatExerciseSettingValueLabel,
  getIntensityRangeLabel,
  getWeightModeLabel,
  parseExerciseSettingInputValue,
} from '@/utils/exerciseSettings';

describe('exercise setting inputs', () => {
  test('formats stored kg values using the current display unit', () => {
    expect(formatExerciseSettingInputValue(45.359237, 'lb')).toBe('100');
    expect(formatExerciseSettingInputValue(80, 'kg')).toBe('80');
    expect(formatExerciseSettingValueLabel(45.359237, 'lb')).toBe('100 lb');
    expect(formatExerciseSettingValueLabel(null, 'kg')).toBe(null);
  });

  test('parses display-unit values back to kg', () => {
    expect(
      Math.abs((parseExerciseSettingInputValue('100', 'lb') ?? 0) - 45.359237) <
        0.000001,
    ).toBe(true);
    expect(parseExerciseSettingInputValue('80', 'kg')).toBe(80);
    expect(parseExerciseSettingInputValue('', 'kg')).toBe(null);
    expect(parseExerciseSettingInputValue('-1', 'kg')).toBe(null);
  });

  test('preserves exercise-specific metadata when updating working weight', () => {
    expect(
      buildWorkingWeightSettingUpdate({
        exerciseId: 'press',
        workingWeight: 67,
        current: {
          exerciseId: 'press',
          workingWeight: 62,
          weightUnit: 'kg',
          weightMode: 'machine_stack',
          incrementKg: 5,
          estimatedOneRepMax: 80,
          notes: 'Main press',
          updatedAt: '2026-06-26T12:00:00.000Z',
        },
        weightUnit: 'lb',
        updatedAt: '2026-06-26T13:00:00.000Z',
      }),
    ).toEqual({
      exerciseId: 'press',
      workingWeight: 67,
      weightUnit: 'kg',
      weightMode: 'machine_stack',
      incrementKg: 5,
      estimatedOneRepMax: 80,
      notes: 'Main press',
      updatedAt: '2026-06-26T13:00:00.000Z',
    });
  });

  test('builds exercise settings only when the editor has real values', () => {
    expect(
      buildUserExerciseSettings({
        exerciseId: 'press',
        workingWeight: '80',
        incrementKg: '2.5',
        weightMode: 'per_hand',
        weightUnit: 'kg',
        updatedAt: '2026-06-26T13:00:00.000Z',
      }),
    ).toEqual({
      exerciseId: 'press',
      workingWeight: 80,
      weightUnit: 'kg',
      weightMode: 'per_hand',
      incrementKg: 2.5,
      updatedAt: '2026-06-26T13:00:00.000Z',
    });

    expect(
      buildUserExerciseSettings({
        exerciseId: 'press',
        workingWeight: '',
        incrementKg: '',
        weightMode: 'total',
        weightUnit: 'kg',
        updatedAt: '2026-06-26T13:00:00.000Z',
      }),
    ).toBe(null);
  });
});

describe('exercise settings helpers', () => {
  test('labels every supported weight mode', () => {
    expect(getWeightModeLabel('total')).toBe('Total');
    expect(getWeightModeLabel('per_hand')).toBe('Per hand');
    expect(getWeightModeLabel('per_side')).toBe('Per side');
    expect(getWeightModeLabel('machine_stack')).toBe('Machine stack');
    expect(getWeightModeLabel('bodyweight')).toBe('Bodyweight');
    expect(getWeightModeLabel('assisted')).toBe('Assisted');
    expect(getWeightModeLabel('custom')).toBe('Custom');
  });

  test('calculates intensity ranges when estimated 1RM exists', () => {
    expect(
      getIntensityRangeLabel({
        intensity: {
          type: 'percent_1rm',
          min: 80,
          max: 85,
          label: '80-85% 1RM',
        },
        settings: {
          exerciseId: 'press',
          weightUnit: 'kg',
          weightMode: 'total',
          estimatedOneRepMax: 80,
          updatedAt: '2026-06-26T12:00:00.000Z',
        },
        weightUnit: 'kg',
      }),
    ).toBe('64-68 kg');
  });

  test('returns null without an estimated 1RM', () => {
    expect(
      getIntensityRangeLabel({
        intensity: {
          type: 'percent_1rm',
          min: 80,
          max: 85,
          label: '80-85% 1RM',
        },
        settings: null,
        weightUnit: 'kg',
      }),
    ).toBe(null);
  });
});
