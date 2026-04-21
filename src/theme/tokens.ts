export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

export function resolveThemeMode(
  preference: ThemePreference,
  system: ThemeMode | null | undefined,
): ThemeMode {
  if (preference === 'system') {
    return system ?? 'dark';
  }
  return preference;
}

export interface DynamicColorOverride {
  primary?: string;
  secondary?: string;
}

export interface ThemeTokens {
  mode: ThemeMode;
  colors: {
    primary: string;
    onPrimary: string;
    primaryContainer: string;
    onPrimaryContainer: string;
    secondary: string;
    onSecondary: string;
    secondaryContainer: string;
    onSecondaryContainer: string;
    error: string;
    errorContainer: string;
    success: string;
    successContainer: string;
    onSuccessContainer: string;
    background: string;
    surface: string;
    surfaceVariant: string;
    surfaceContainer: string;
    surfaceContainerHigh: string;
    surfaceContainerHighest: string;
    outline: string;
    outlineVariant: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;

    // Compatibility aliases for existing component code.
    bgBase: string;
    bgSurface: string;
    bgElevated: string;
    borderSubtle: string;
    borderStrong: string;
    accentPrimary: string;
    accentSecondary: string;
    accentWarning: string;
    accentDanger: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    pill: number;
  };
  type: {
    title: number;
    subtitle: number;
    body: number;
    label: number;
    metric: number;
  };
}

export function withAlpha(hexColor: string, alpha: number) {
  const clamped = Math.max(0, Math.min(1, alpha));
  const normalized = hexColor.replace('#', '');
  const short = normalized.length === 3;
  const full = short
    ? normalized
        .split('')
        .map((ch) => ch + ch)
        .join('')
    : normalized;

  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}

const lightBase: ThemeTokens = {
  mode: 'light',
  colors: {
    primary: '#1faa64',
    onPrimary: '#ffffff',
    primaryContainer: 'rgba(31,170,100,0.08)',
    onPrimaryContainer: '#1a1a1e',
    secondary: '#17885e',
    onSecondary: '#ffffff',
    secondaryContainer: 'rgba(23,136,94,0.08)',
    onSecondaryContainer: '#1a1a1e',
    error: '#d94343',
    errorContainer: 'rgba(217,67,67,0.08)',
    success: '#1faa64',
    successContainer: 'rgba(31,170,100,0.08)',
    onSuccessContainer: '#1a1a1e',
    background: '#e8e8ed',
    surface: '#f4f4f8',
    surfaceVariant: '#e0e0e6',
    surfaceContainer: '#f4f4f8',
    surfaceContainerHigh: '#e4e4ea',
    surfaceContainerHighest: '#d8d8e0',
    outline: '#6e6e73',
    outlineVariant: 'rgba(0,0,0,0.10)',
    textPrimary: '#1a1a1e',
    textSecondary: '#6e6e73',
    textMuted: '#aeaeb2',

    bgBase: '#e8e8ed',
    bgSurface: '#f4f4f8',
    bgElevated: '#e4e4ea',
    borderSubtle: 'rgba(0,0,0,0.10)',
    borderStrong: 'rgba(0,0,0,0.18)',
    accentPrimary: '#1faa64',
    accentSecondary: '#17885e',
    accentWarning: '#c78520',
    accentDanger: '#d94343',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    pill: 999,
  },
  type: {
    title: 22,
    subtitle: 18,
    body: 14,
    label: 12,
    metric: 34,
  },
};

const darkBase: ThemeTokens = {
  mode: 'dark',
  colors: {
    primary: '#3dd68c',
    onPrimary: '#0a0a0c',
    primaryContainer: 'rgba(61,214,140,0.10)',
    onPrimaryContainer: '#e8e8ec',
    secondary: '#2eb87a',
    onSecondary: '#0a0a0c',
    secondaryContainer: 'rgba(46,184,122,0.10)',
    onSecondaryContainer: '#e8e8ec',
    error: '#ff6b6b',
    errorContainer: 'rgba(255,107,107,0.10)',
    success: '#3dd68c',
    successContainer: 'rgba(61,214,140,0.12)',
    onSuccessContainer: '#e8e8ec',
    background: '#111113',
    surface: '#1a1a1e',
    surfaceVariant: '#222226',
    surfaceContainer: '#1a1a1e',
    surfaceContainerHigh: '#222226',
    surfaceContainerHighest: '#2a2a2e',
    outline: '#8e8e93',
    outlineVariant: 'rgba(255,255,255,0.06)',
    textPrimary: '#e8e8ec',
    textSecondary: '#8e8e93',
    textMuted: '#5a5a5e',

    bgBase: '#111113',
    bgSurface: '#1a1a1e',
    bgElevated: '#222226',
    borderSubtle: 'rgba(255,255,255,0.06)',
    borderStrong: 'rgba(255,255,255,0.12)',
    accentPrimary: '#3dd68c',
    accentSecondary: '#2eb87a',
    accentWarning: '#f0a848',
    accentDanger: '#ff6b6b',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    pill: 999,
  },
  type: {
    title: 22,
    subtitle: 18,
    body: 14,
    label: 12,
    metric: 34,
  },
};

function applyDynamicOverride(
  base: ThemeTokens,
  dynamic: DynamicColorOverride | undefined,
) {
  if (!dynamic) return base;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: dynamic.primary ?? base.colors.primary,
      secondary: dynamic.secondary ?? base.colors.secondary,
      accentPrimary: dynamic.primary ?? base.colors.accentPrimary,
      accentSecondary: dynamic.secondary ?? base.colors.accentSecondary,
    },
  };
}

export function getThemeTokens(
  mode: ThemeMode,
  options?: {
    enableDynamicColor?: boolean;
    dynamicOverride?: DynamicColorOverride;
  },
): ThemeTokens {
  const seed = mode === 'light' ? lightBase : darkBase;
  if (!options?.enableDynamicColor) return seed;
  return applyDynamicOverride(seed, options.dynamicOverride);
}
