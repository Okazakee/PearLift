import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';

interface HeaderProps {
  tokens: ThemeTokens;
  topInset: number;
  onOpenLocalBackup: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  onResetData: () => void;
}

export function Header({
  tokens,
  topInset,
  onOpenLocalBackup,
  onOpenSettings,
  onToggleTheme,
  onResetData,
}: HeaderProps) {
  const styles = createStyles(tokens, topInset);

  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <View style={styles.logoBadge}>
          <MaterialIcons name="fitness-center" size={23} color="#FFFFFF" />
        </View>
        <View>
          <Text style={styles.title}>PearLift</Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable onPress={onOpenLocalBackup} style={styles.iconButton}>
          <MaterialIcons
            name="save-alt"
            size={20}
            color={tokens.colors.textPrimary}
          />
        </Pressable>
        <Pressable onPress={onToggleTheme} style={styles.iconButton}>
          <MaterialIcons
            name={tokens.mode === 'dark' ? 'light-mode' : 'dark-mode'}
            size={20}
            color={tokens.colors.textSecondary}
          />
        </Pressable>
        <Pressable onPress={onOpenSettings} style={styles.iconButton}>
          <MaterialIcons
            name="settings"
            size={20}
            color={tokens.colors.textPrimary}
          />
        </Pressable>
        <Pressable onPress={onResetData} style={styles.iconButtonDanger}>
          <MaterialIcons
            name="restart-alt"
            size={20}
            color={tokens.colors.error}
          />
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(tokens: ThemeTokens, topInset: number) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: topInset + tokens.spacing.sm,
      paddingBottom: tokens.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.borderSubtle,
      backgroundColor: withAlpha(tokens.colors.background, 0.9),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.md,
    },
    logoBadge: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 22,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButtonDanger: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
