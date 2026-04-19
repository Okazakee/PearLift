import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ThemeMode, ThemePreference, ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';

interface SettingsScreenProps {
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
  onClose: () => void;
  onOpenGithub: () => void;
  onOpenSyncSetup: () => void;
}

export function SettingsScreen({
  open,
  tokens,
  topInset,
  bottomInset,
  appName,
  appVersion,
  appBuild,
  buildType,
  themePreference,
  systemThemeMode,
  onThemePreferenceChange,
  onClose,
  onOpenGithub,
  onOpenSyncSetup,
}: SettingsScreenProps) {
  const styles = createStyles(tokens, topInset, bottomInset);
  const themeSubtitle =
    themePreference === 'system'
      ? `Follows system (${systemThemeMode ?? 'unknown'}).`
      : `Forced to ${themePreference === 'dark' ? 'Dark' : 'Light'}.`;

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

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={onClose}>
            <MaterialIcons
              name="arrow-back"
              size={22}
              color={tokens.colors.textPrimary}
            />
          </Pressable>
          <Text style={styles.title}>Settings</Text>
          <View style={styles.backButtonPlaceholder} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons
                name="palette"
                size={18}
                color={tokens.colors.primary}
              />
              <Text style={styles.sectionTitle}>Appearance</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Theme</Text>
                <Text style={styles.rowSubtitle}>{themeSubtitle}</Text>
              </View>
              <View style={styles.segmented}>
                <Pressable
                  style={optionStyle('system')}
                  onPress={() => onThemePreferenceChange('system')}
                >
                  <Text style={optionTextStyle('system')}>System</Text>
                </Pressable>
                <Pressable
                  style={optionStyle('light')}
                  onPress={() => onThemePreferenceChange('light')}
                >
                  <Text style={optionTextStyle('light')}>Light</Text>
                </Pressable>
                <Pressable
                  style={optionStyle('dark')}
                  onPress={() => onThemePreferenceChange('dark')}
                >
                  <Text style={optionTextStyle('dark')}>Dark</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons
                name="translate"
                size={18}
                color={tokens.colors.primary}
              />
              <Text style={styles.sectionTitle}>Language</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>System language</Text>
                <Text style={styles.rowSubtitle}>
                  App follows system language. Current fallback: English.
                </Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>System</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons
                name="info-outline"
                size={18}
                color={tokens.colors.primary}
              />
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
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Build type</Text>
              <Text style={styles.infoValue}>{buildType}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons
                name="sync"
                size={18}
                color={tokens.colors.primary}
              />
              <Text style={styles.sectionTitle}>Sync & Backup</Text>
            </View>
            <Text style={styles.rowSubtitle}>
              Review setup mode, relay backup preference, and recovery flow.
            </Text>
            <Pressable style={styles.githubButton} onPress={onOpenSyncSetup}>
              <MaterialIcons
                name="tune"
                size={20}
                color={tokens.colors.onPrimary}
              />
              <Text style={styles.githubButtonText}>Open Sync Setup</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons
                name="code"
                size={18}
                color={tokens.colors.primary}
              />
              <Text style={styles.sectionTitle}>Developer</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Maintainer</Text>
              <Text style={styles.infoValue}>Okazakee</Text>
            </View>
            <Pressable style={styles.githubButton} onPress={onOpenGithub}>
              <MaterialCommunityIcons
                name="github"
                size={20}
                color={tokens.colors.onPrimary}
              />
              <Text style={styles.githubButtonText}>
                Open GitHub Repository
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
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
      backgroundColor: withAlpha(tokens.colors.primary, 0.12),
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
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
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
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(tokens.colors.outlineVariant, 0.7),
    },
    infoLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '500',
    },
    infoValue: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '600',
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
  });
}
