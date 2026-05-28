import type { PearLiftRuntimeState } from '@/backup/types';
import { MAX_DAY_CONFIGS } from '@/config/constants';
import {
  buildInitialWeights,
  defaultDayConfigs,
  defaultWeekConfigs,
  defaultWorkouts,
} from '@/data/workouts';
import type { DayConfig, WeightUnit, WorkoutSession } from '@/types';

export const DEFAULT_PROGRAM_ID = 'main-program';
export const DEFAULT_ROOM_ID = 'default';
export const DEVICE_DISPLAY_NAME_SETTING = 'syncDeviceDisplayName';
export const DAY_CONFIG_REVISION_SETTING = 'syncDayConfigsRevisionAt';
export const WEEK_CONFIG_REVISION_SETTING = 'syncWeekConfigsRevisionAt';
export const SYNC_APPLIED_OP_RETENTION_LIMIT = 4000;

export const SUPPORTED_LANGUAGES = [
  { code: 'en', native: 'English' },
  { code: 'de', native: 'Deutsch' },
  { code: 'fr', native: 'Français' },
  { code: 'es', native: 'Español' },
  { code: 'it', native: 'Italiano' },
  { code: 'pt', native: 'Português' },
  { code: 'nl', native: 'Nederlands' },
  { code: 'pl', native: 'Polski' },
  { code: 'sv', native: 'Svenska' },
  { code: 'da', native: 'Dansk' },
  { code: 'fi', native: 'Suomi' },
  { code: 'no', native: 'Norsk' },
  { code: 'cs', native: 'Čeština' },
  { code: 'hu', native: 'Magyar' },
  { code: 'ro', native: 'Română' },
  { code: 'el', native: 'Ελληνικά' },
  { code: 'bg', native: 'Български' },
  { code: 'hr', native: 'Hrvatski' },
  { code: 'sk', native: 'Slovenčina' },
  { code: 'sl', native: 'Slovenščina' },
  { code: 'et', native: 'Eesti' },
  { code: 'lv', native: 'Latviešu' },
  { code: 'lt', native: 'Lietuvių' },
  { code: 'zh', native: '中文' },
  { code: 'ar', native: 'العربية' },
  { code: 'hi', native: 'हिन्दी' },
  { code: 'ru', native: 'Русский' },
  { code: 'ja', native: '日本語' },
  { code: 'ko', native: '한국어' },
  { code: 'tr', native: 'Türkçe' },
  { code: 'vi', native: 'Tiếng Việt' },
  { code: 'th', native: 'ไทย' },
  { code: 'id', native: 'Bahasa Indonesia' },
] as const;

export function cloneDefaultWorkouts(): WorkoutSession[] {
  return JSON.parse(JSON.stringify(defaultWorkouts)) as WorkoutSession[];
}

export function buildDefaultRuntimeState(): PearLiftRuntimeState {
  const workouts = cloneDefaultWorkouts();
  return {
    workouts,
    userWeights: buildInitialWeights(workouts),
    weekConfigs: defaultWeekConfigs,
    dayConfigs: defaultDayConfigs,
    currentWeek: 1,
    currentDay: defaultDayConfigs[0]?.id ?? 'push',
    restDuration: 150,
    themeMode: 'system',
    weightUnit: 'kg',
    language: 'system',
  };
}

export function buildResetWorkoutDataState(
  current: PearLiftRuntimeState,
): PearLiftRuntimeState {
  const defaults = buildDefaultRuntimeState();
  return {
    ...defaults,
    restDuration: current.restDuration,
    themeMode: current.themeMode,
    weightUnit: current.weightUnit,
    language: current.language,
  };
}

export function parseNumber(
  value: string | null | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function coerceThemeMode(
  value: string | null | undefined,
): PearLiftRuntimeState['themeMode'] {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return 'system';
}

export function coerceWeightUnit(value: string | null | undefined): WeightUnit {
  return value === 'lb' ? 'lb' : 'kg';
}

export function coerceLanguage(value: string | null | undefined): string {
  if (!value) return 'system';
  if (value === 'system') return 'system';
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === value)
    ? value
    : 'system';
}

export function getLanguageNativeName(code: string): string {
  const lang = SUPPORTED_LANGUAGES.find((item) => item.code === code);
  return lang?.native ?? code;
}

export function normalizeDayConfigs(
  workouts: WorkoutSession[],
  dayConfigs: DayConfig[],
  options: { fallbackToDefault?: boolean } = {},
): DayConfig[] {
  const fallbackToDefault = options.fallbackToDefault ?? true;
  const seen = new Set<string>();
  const merged: DayConfig[] = [];

  for (const day of dayConfigs) {
    if (seen.has(day.id)) continue;
    seen.add(day.id);
    if (merged.length >= MAX_DAY_CONFIGS) break;
    merged.push(day);
  }

  for (const workout of workouts) {
    if (merged.length >= MAX_DAY_CONFIGS) break;
    if (seen.has(workout.id)) continue;
    seen.add(workout.id);
    merged.push({
      id: workout.id,
      name: workout.name || `Day ${merged.length + 1}`,
      icon: 'FitnessCenter',
    });
  }

  if (merged.length > 0) return merged;
  return fallbackToDefault ? defaultDayConfigs : [];
}

export function createExerciseId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'exercise'}-${Date.now().toString(36)}`;
}

export function toDeviceCode(deviceId: string): string {
  return deviceId.replace(/-/g, '').slice(-4).toUpperCase();
}

export function buildDefaultDeviceName(deviceId: string): string {
  return `PearLift device ${toDeviceCode(deviceId)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
