import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import { AnimatedModalShell } from '../AnimatedModalShell';

export interface AppPromptAction {
  label: string;
  tone?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AppPromptModalProps {
  open: boolean;
  tokens: ThemeTokens;
  title: string;
  message: string;
  actions: AppPromptAction[];
  onClose: () => void;
}

export function AppPromptModal({
  open,
  tokens,
  title,
  message,
  actions,
  onClose,
}: AppPromptModalProps) {
  const styles = createStyles(tokens);

  const handleAction = (action: AppPromptAction) => {
    onClose();
    action.onPress?.();
  };

  return (
    <AnimatedModalShell
      open={open}
      onClose={onClose}
      containerStyle={styles.modalRoot}
      backdropStyle={styles.backdrop}
      sheetStyle={styles.sheet}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.actionsRow}>
        {actions.map((action) => {
          const tone = action.tone ?? 'default';
          return (
            <Pressable
              key={action.label}
              style={[
                styles.actionButton,
                tone === 'cancel' && styles.actionCancel,
                tone === 'destructive' && styles.actionDestructive,
              ]}
              onPress={() => handleAction(action)}
            >
              <Text
                style={[
                  styles.actionText,
                  tone === 'cancel' && styles.actionCancelText,
                  tone === 'destructive' && styles.actionDestructiveText,
                ]}
              >
                {action.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </AnimatedModalShell>
  );
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    modalRoot: {
      paddingHorizontal: tokens.spacing.lg,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.58)',
    },
    sheet: {
      width: '100%',
      maxWidth: 420,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.md,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontFamily: 'SpaceGrotesk_700Bold',
    },
    message: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      lineHeight: 21,
    },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: tokens.spacing.sm,
    },
    actionButton: {
      minHeight: 40,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
    },
    actionCancel: {
      backgroundColor: tokens.colors.bgSurface,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
    },
    actionDestructive: {
      backgroundColor: withAlpha(tokens.colors.error, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.4),
    },
    actionText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontFamily: 'SpaceGrotesk_700Bold',
    },
    actionCancelText: {
      color: tokens.colors.textPrimary,
    },
    actionDestructiveText: {
      color: tokens.colors.accentDanger,
    },
  });
}
