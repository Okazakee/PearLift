import { Copy, Wallet, X, Zap } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DonationTarget } from '../../config/donation';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import { AnimatedModalShell } from '../AnimatedModalShell';

interface DonateModalProps {
  open: boolean;
  tokens: ThemeTokens;
  targets: DonationTarget[];
  onClose: () => void;
  onOpenTarget: (target: DonationTarget) => void;
  onCopyTarget: (target: DonationTarget) => void;
}

export function DonateModal({
  open,
  tokens,
  targets,
  onClose,
  onOpenTarget,
  onCopyTarget,
}: DonateModalProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <AnimatedModalShell
      open={open}
      onClose={onClose}
      containerStyle={styles.modalRoot}
      backdropStyle={styles.backdrop}
      sheetStyle={styles.card}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Donate</Text>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <X size={18} color={tokens.colors.textSecondary} />
        </Pressable>
      </View>

      <Text style={styles.subtitle}>
        Support PearLift development with Bitcoin or Lightning.
      </Text>

      {targets.map((target) => {
        const isLightning = target.method === 'lightning';
        return (
          <View key={target.method} style={styles.section}>
            <View style={styles.sectionHeader}>
              {isLightning ? (
                <Zap size={16} color={tokens.colors.primary} />
              ) : (
                <Wallet size={16} color={tokens.colors.primary} />
              )}
              <Text style={styles.sectionTitle}>{target.label}</Text>
              {target.isPlaceholder ? (
                <View style={styles.placeholderBadge}>
                  <Text style={styles.placeholderBadgeText}>Placeholder</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.valueContainer}>
              <Text style={styles.valueText}>{target.copyValue}</Text>
            </View>

            <View style={styles.actions}>
              <Pressable
                style={styles.primaryButton}
                onPress={() => onOpenTarget(target)}
              >
                <Wallet size={18} color={tokens.colors.onPrimary} />
                <Text style={styles.primaryButtonText}>Open wallet</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => onCopyTarget(target)}
              >
                <Copy size={18} color={tokens.colors.textPrimary} />
                <Text style={styles.secondaryButtonText}>Copy</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
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
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    card: {
      width: '100%',
      maxWidth: 520,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.md,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
    },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subtitle: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      lineHeight: 20,
    },
    section: {
      gap: tokens.spacing.sm,
      padding: tokens.spacing.md,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: withAlpha(tokens.colors.primary, 0.04),
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
    placeholderBadge: {
      marginLeft: 'auto',
      borderRadius: tokens.radius.pill,
      paddingHorizontal: tokens.spacing.xs,
      paddingVertical: 3,
      backgroundColor: withAlpha(tokens.colors.accentDanger, 0.12),
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.35),
    },
    placeholderBadgeText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    valueContainer: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.bgSurface,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.sm,
    },
    valueText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      lineHeight: 19,
      fontFamily: 'SpaceGrotesk_500Medium',
    },
    actions: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
    },
    primaryButton: {
      flex: 1,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      minHeight: 42,
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
    },
    primaryButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    secondaryButton: {
      flex: 1,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.bgSurface,
      minHeight: 42,
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
    },
    secondaryButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
  });
}
