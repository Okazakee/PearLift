import {
  AlertTriangle,
  ChevronLeft,
  Code,
  CodeXml,
  Globe,
  Heart,
  Info,
  RefreshCw,
  Sliders,
  Sun,
} from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../../animation/primitives';
import type {
  ThemeMode,
  ThemePreference,
  ThemeTokens,
} from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import type { WeightUnit } from '../../types';
import { AnimatedScreenModal } from '../AnimatedScreenModal';

interface SettingsModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  appName: string;
  appVersion: string;
  appBuild: string;
  buildType: string;
  themePreference: ThemePreference;
  systemThemeMode: ThemeMode | null;
  onThemePreferenceChange: (next: ThemePreference) => void;
  weightUnit: WeightUnit;
  onWeightUnitChange: (next: WeightUnit) => void;
  onClose: () => void;
  onResetData: () => void;
  onOpenGithub: () => void;
  onOpenDonate: () => void;
}

export function SettingsModal({
  open,
  tokens,
  topInset,
  bottomInset,
  appName,
  appVersion,
  appBuild,
  buildType,
  themePreference,
  onThemePreferenceChange,
  weightUnit,
  onWeightUnitChange,
  onClose,
  onResetData,
  onOpenGithub,
  onOpenDonate,
}: SettingsModalProps) {
  const styles = createStyles(tokens, topInset, bottomInset);
  const themeSubtitle = 'App color schema';

  const optionStyle = (value: ThemePreference) => {
    const selected = themePreference === value;
    if (!selected) return styles.segment;
    return [styles.segment, styles.segmentSelected];
  };

  const optionTextStyle = (value: ThemePreference) => {
    const selected = themePreference === value;
    if (!selected) return styles.segmentText;
    return [styles.segmentText, styles.segmentTextSelected];
  };

  const unitOptionStyle = (value: WeightUnit) => {
    const selected = weightUnit === value;
    if (!selected) return styles.segment;
    return [styles.segment, styles.segmentSelected];
  };

  const unitOptionTextStyle = (value: WeightUnit) => {
    const selected = weightUnit === value;
    if (!selected) return styles.segmentText;
    return [styles.segmentText, styles.segmentTextSelected];
  };

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={onClose}>
            <ChevronLeft size={22} color={tokens.colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.title}>Settings</Text>
          <View style={styles.backButtonPlaceholder} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Sun size={16} color={tokens.colors.primary} />
              <Text style={styles.sectionTitle}>Appearance</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Theme</Text>
                <Text style={styles.rowSubtitle}>{themeSubtitle}</Text>
              </View>
              <View style={styles.segmented}>
                <AnimatedPressable
                  style={optionStyle('system')}
                  onPress={() => onThemePreferenceChange('system')}
                >
                  <Text style={optionTextStyle('system')}>System</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={optionStyle('light')}
                  onPress={() => onThemePreferenceChange('light')}
                >
                  <Text style={optionTextStyle('light')}>Light</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={optionStyle('dark')}
                  onPress={() => onThemePreferenceChange('dark')}
                >
                  <Text style={optionTextStyle('dark')}>Dark</Text>
                </AnimatedPressable>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Weight unit</Text>
                <Text style={styles.rowSubtitle}>Choose your weight unit</Text>
              </View>
              <View style={styles.segmented}>
                <AnimatedPressable
                  style={unitOptionStyle('kg')}
                  onPress={() => onWeightUnitChange('kg')}
                >
                  <Text style={unitOptionTextStyle('kg')}>kg</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={unitOptionStyle('lb')}
                  onPress={() => onWeightUnitChange('lb')}
                >
                  <Text style={unitOptionTextStyle('lb')}>lb</Text>
                </AnimatedPressable>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Globe size={16} color={tokens.colors.primary} />
              <Text style={styles.sectionTitle}>Language</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>System language</Text>
                <Text style={styles.rowSubtitle}>App language</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>System</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <RefreshCw size={16} color={tokens.colors.primary} />
              <Text style={styles.sectionTitle}>Sync & Backup</Text>
            </View>
            <Text style={styles.rowSubtitle}>
              Device-to-device sync is coming soon.
            </Text>
            <AnimatedPressable
              style={[styles.githubButton, styles.disabledButton]}
              onPress={() => {}}
              disabled
            >
              <Sliders size={18} color={tokens.colors.onPrimary} />
              <Text style={styles.githubButtonText}>Open Sync Setup</Text>
            </AnimatedPressable>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AlertTriangle size={16} color={tokens.colors.accentDanger} />
              <Text style={styles.sectionTitle}>Data</Text>
            </View>
            <Text style={styles.rowSubtitle}>
              Permanently reset all workouts, settings, timer data, and sync
              history.
            </Text>
            <AnimatedPressable style={styles.resetButton} onPress={onResetData}>
              <RefreshCw size={18} color={tokens.colors.accentDanger} />
              <Text style={styles.resetButtonText}>Reset All Data</Text>
            </AnimatedPressable>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Code size={16} color={tokens.colors.primary} />
              <Text style={styles.sectionTitle}>Developer</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Maintainer</Text>
              <Text style={styles.infoValue}>Okazakee</Text>
            </View>
            <View style={styles.developerButtons}>
              <AnimatedPressable
                style={styles.developerPrimaryButton}
                onPress={onOpenGithub}
              >
                <CodeXml size={18} color={tokens.colors.onPrimary} />
                <Text style={styles.githubButtonText}>Open Repo</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.developerSecondaryButton}
                onPress={onOpenDonate}
              >
                <Heart size={18} color={tokens.colors.primary} />
                <Text style={styles.donateButtonText}>Donate</Text>
              </AnimatedPressable>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Info size={16} color={tokens.colors.primary} />
              <Text style={styles.sectionTitle}>App Info</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>{appName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Version</Text>
              <Text style={styles.infoValue}>{appVersion}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Build</Text>
              <Text style={styles.infoValue}>{appBuild}</Text>
            </View>
            <View style={styles.infoRowLast}>
              <Text style={styles.infoLabel}>Build type</Text>
              <Text style={styles.infoValue}>{buildType}</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </AnimatedScreenModal>
  );
}

function createStyles(
  tokens: ThemeTokens,
  topInset: number,
  bottomInset: number,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.colors.bgBase,
    },
    header: {
      paddingTop: topInset + tokens.spacing.sm,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.outlineVariant,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.bgSurface,
    },
    backButtonPlaceholder: {
      width: 36,
      height: 36,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
    },
    content: {
      padding: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.xxl,
      gap: tokens.spacing.md,
    },
    section: {
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm + 2,
    },
    sectionTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
    rowSubtitle: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      lineHeight: 16,
    },
    segmented: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: withAlpha(tokens.colors.primary, 0.06),
    },
    segment: {
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 68,
    },
    segmentSelected: {
      backgroundColor: withAlpha(tokens.colors.primary, 0.22),
    },
    segmentText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    segmentTextSelected: {
      color: tokens.colors.textPrimary,
    },
    badge: {
      borderRadius: tokens.radius.pill,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs,
      backgroundColor: withAlpha(tokens.colors.primary, 0.15),
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.primary, 0.25),
    },
    badgeText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: tokens.spacing.xs,
      borderBottomWidth: 0.5,
      borderBottomColor:
        tokens.mode === 'dark'
          ? withAlpha('#d1d1d6', 0.28)
          : withAlpha(tokens.colors.outline, 0.18),
    },
    infoRowLast: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: tokens.spacing.xs,
    },
    infoLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '500',
    },
    infoValue: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontFamily: 'SpaceGrotesk_600SemiBold',
    },
    githubButton: {
      marginTop: tokens.spacing.xs,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.md,
    },
    githubButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    developerButtons: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.xs,
      width: '100%',
    },
    developerPrimaryButton: {
      flex: 1,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.md,
    },
    developerSecondaryButton: {
      flex: 1,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.bgSurface,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
    },
    donateButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    disabledButton: {
      opacity: 0.55,
    },
    resetButton: {
      marginTop: tokens.spacing.xs,
      borderRadius: tokens.radius.md,
      backgroundColor: '#291a1c',
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.35),
    },
    resetButtonText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
  });
}
