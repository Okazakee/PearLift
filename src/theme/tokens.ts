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
    primary: '#6750A4',
    onPrimary: '#FFFFFF',
    primaryContainer: '#EADDFF',
    onPrimaryContainer: '#21005D',
    secondary: '#625B71',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#E8DEF8',
    onSecondaryContainer: '#1D192B',
    error: '#B3261E',
    errorContainer: '#F9DEDC',
    success: '#1B873B',
    successContainer: '#B7F5C7',
    onSuccessContainer: '#002106',
    background: '#FEF7FF',
    surface: '#F3EDF7',
    surfaceVariant: '#E7E0EC',
    surfaceContainer: '#F3EDF7',
    surfaceContainerHigh: '#ECE6F0',
    surfaceContainerHighest: '#E6E0E9',
    outline: '#79747E',
    outlineVariant: '#CAC4D0',
    textPrimary: '#1D1B20',
    textSecondary: '#49454F',
    textMuted: '#625F68',

    bgBase: '#FEF7FF',
    bgSurface: '#F3EDF7',
    bgElevated: '#ECE6F0',
    borderSubtle: '#CAC4D0',
    borderStrong: '#79747E',
    accentPrimary: '#6750A4',
    accentSecondary: '#625B71',
    accentWarning: '#8A5300',
    accentDanger: '#B3261E',
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
    xl: 28,
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
    primary: '#D0BCFF',
    onPrimary: '#381E72',
    primaryContainer: '#4F378B',
    onPrimaryContainer: '#EADDFF',
    secondary: '#CCC2DC',
    onSecondary: '#332D41',
    secondaryContainer: '#4A4458',
    onSecondaryContainer: '#E8DEF8',
    error: '#F2B8B5',
    errorContainer: '#8C1D18',
    success: '#86EFAC',
    successContainer: '#1B5E20',
    onSuccessContainer: '#D8FDDD',
    background: '#141218',
    surface: '#211F26',
    surfaceVariant: '#49454F',
    surfaceContainer: '#211F26',
    surfaceContainerHigh: '#2B2930',
    surfaceContainerHighest: '#36343B',
    outline: '#938F99',
    outlineVariant: '#49454F',
    textPrimary: '#E6E1E5',
    textSecondary: '#CAC4D0',
    textMuted: '#A39DAA',

    bgBase: '#141218',
    bgSurface: '#211F26',
    bgElevated: '#2B2930',
    borderSubtle: '#49454F',
    borderStrong: '#938F99',
    accentPrimary: '#D0BCFF',
    accentSecondary: '#CCC2DC',
    accentWarning: '#FFD8A8',
    accentDanger: '#F2B8B5',
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
    xl: 28,
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
