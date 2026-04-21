import { getLocales, type Locale, useLocales } from 'expo-localization';
import { useMemo } from 'react';

type LocaleLike = Pick<Locale, 'languageCode' | 'languageTag'>;

const LANGUAGE_ALIASES: Record<string, string> = {
  // Norwegian on Android often reports nb/nn; the app uses "no".
  nb: 'no',
  nn: 'no',
  // Indonesian can be reported as "in" on some platforms.
  in: 'id',
};

export function normalizeLanguageCode(code: string): string {
  const normalized = code.trim().toLowerCase().replace(/_/g, '-');
  const base = normalized.split('-')[0] ?? '';
  return LANGUAGE_ALIASES[base] ?? base;
}

export function pickBestSupportedLanguage(
  supported: readonly string[],
  locales: readonly LocaleLike[] | null | undefined,
  fallback = 'en',
): string {
  const supportedSet = new Set(supported);
  for (const locale of locales ?? []) {
    const candidates = [locale.languageCode, locale.languageTag];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const normalized = normalizeLanguageCode(candidate);
      if (supportedSet.has(normalized)) {
        return normalized;
      }
    }
  }
  return supportedSet.has(fallback) ? fallback : (supported[0] ?? 'en');
}

export function getSystemLanguage(
  supported: readonly string[],
  fallback = 'en',
): string {
  return pickBestSupportedLanguage(supported, getLocales(), fallback);
}

export function useSystemLanguage(
  supported: readonly string[],
  fallback = 'en',
): string {
  const locales = useLocales();
  return useMemo(
    () => pickBestSupportedLanguage(supported, locales, fallback),
    [fallback, locales, supported],
  );
}
