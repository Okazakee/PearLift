import { describe, expect, test } from 'bun:test';
import {
  buildDefaultRuntimeState,
  buildResetWorkoutDataState,
  coerceLanguage,
  coerceThemeMode,
  coerceWeightUnit,
  getLanguageNativeName,
  normalizeDayConfigs,
} from '@/storage/repository/defaults';

describe('storage defaults helpers', () => {
  test('buildDefaultRuntimeState returns a seeded runtime', () => {
    const runtime = buildDefaultRuntimeState();

    expect(runtime.workouts.length).toBeGreaterThan(0);
    expect(runtime.dayConfigs.length).toBeGreaterThan(0);
    expect(runtime.currentWeek).toBe(1);
    expect(runtime.weightUnit).toBe('kg');
    expect(runtime.language).toBe('system');
  });

  test('buildResetWorkoutDataState preserves user preferences', () => {
    const base = buildDefaultRuntimeState();
    const reset = buildResetWorkoutDataState({
      ...base,
      restDuration: 210,
      themeMode: 'dark',
      weightUnit: 'lb',
      language: 'it',
    });

    expect(reset.restDuration).toBe(210);
    expect(reset.themeMode).toBe('dark');
    expect(reset.weightUnit).toBe('lb');
    expect(reset.language).toBe('it');
  });

  test('coercion helpers fall back safely', () => {
    expect(coerceThemeMode('bogus')).toBe('system');
    expect(coerceWeightUnit('bogus')).toBe('kg');
    expect(coerceLanguage('bogus')).toBe('system');
  });

  test('language helpers expose native names', () => {
    expect(getLanguageNativeName('it')).toBe('Italiano');
    expect(getLanguageNativeName('unknown')).toBe('unknown');
  });

  test('normalizeDayConfigs keeps unique ids and backfills workouts', () => {
    const result = normalizeDayConfigs(
      [{ id: 'legs', name: 'Leg Day', description: '', exercises: [] }],
      [
        { id: 'push', name: 'Push', icon: 'FitnessCenter' },
        { id: 'push', name: 'Push Duplicate', icon: 'FitnessCenter' },
      ],
      { fallbackToDefault: false },
    );

    expect(result).toEqual([
      { id: 'push', name: 'Push', icon: 'FitnessCenter' },
      { id: 'legs', name: 'Leg Day', icon: 'FitnessCenter' },
    ]);
  });
});
