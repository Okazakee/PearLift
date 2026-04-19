import { Download, Settings } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeTokens } from '../theme/tokens';

interface HeaderProps {
  tokens: ThemeTokens;
  topInset: number;
  onOpenLocalBackup: () => void;
  onOpenSettings: () => void;
}

export function Header({
  tokens,
  topInset,
  onOpenLocalBackup,
  onOpenSettings,
}: HeaderProps) {
  const styles = createStyles(tokens, topInset);

  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <View style={styles.logoBadge}>
          <Image
            source={require('../../assets/pearlift_transparent.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        <View>
          <Text style={styles.title}>PearLift</Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable onPress={onOpenLocalBackup} style={styles.iconButton}>
          <Download size={18} color={tokens.colors.textSecondary} />
        </Pressable>
        <Pressable onPress={onOpenSettings} style={styles.iconButton}>
          <Settings size={18} color={tokens.colors.textSecondary} />
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
      backgroundColor: tokens.colors.background,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    logoBadge: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: tokens.colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoImage: {
      width: 24,
      height: 24,
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
      backgroundColor: tokens.colors.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
