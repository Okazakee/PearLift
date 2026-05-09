import { StyleSheet } from 'react-native';
import type { useResponsiveLayout } from '../../../hooks/useResponsiveLayout';
import type { ThemeTokens } from '../../../theme/tokens';
import { withAlpha } from '../../../theme/tokens';

export function createSettingsStyles(
  tokens: ThemeTokens,
  topInset: number,
  bottomInset: number,
  layout: ReturnType<typeof useResponsiveLayout>,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.colors.bgBase,
    },
    tabletPanelModalRoot: {
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
    },
    tabletPanelBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.34)',
    },
    tabletPanelSheet: {
      width: layout.isLandscape ? 520 : 440,
      height: '100%',
      overflow: 'hidden',
      borderTopLeftRadius: tokens.radius.xl,
      borderBottomLeftRadius: tokens.radius.xl,
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
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.isLandscape ? 920 : undefined,
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
      flexShrink: 1,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: tokens.spacing.sm,
      flexWrap: layout.isLandscape ? 'wrap' : 'nowrap',
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
      lineHeight: 18,
    },
    segmented: {
      flexDirection: 'row',
      borderRadius: tokens.radius.pill,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      overflow: 'hidden',
      flexShrink: 0,
      backgroundColor: tokens.colors.surfaceContainerHigh,
    },
    segment: {
      paddingHorizontal: tokens.spacing.md,
      minHeight: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentSelected: {
      backgroundColor: withAlpha(tokens.colors.primary, 0.16),
      borderColor: 'transparent',
    },
    segmentText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    segmentTextSelected: {
      color: tokens.colors.primary,
    },
    outlineButton: {
      minHeight: 44,
      flex: layout.isLandscape ? 1 : 0,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      gap: tokens.spacing.sm,
    },
    outlineButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
    backupGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.xs,
    },
    backupButton: {
      width: '48%',
      minHeight: 66,
    },
    resetButton: {
      marginTop: tokens.spacing.sm,
      minHeight: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.32),
      backgroundColor: withAlpha(tokens.colors.accentDanger, 0.08),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      gap: tokens.spacing.sm,
    },
    resetButtonText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
    developerButtons: {
      flexDirection: 'row',
      marginTop: tokens.spacing.xs,
    },
    developerPrimaryButton: {
      minHeight: 44,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      flex: 1,
    },
    githubButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: tokens.spacing.md,
    },
    infoRowLast: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.xs,
    },
    infoLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    infoValue: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
      flexShrink: 1,
      textAlign: 'right',
    },
    poweredByFooter: {
      alignItems: 'center',
      paddingVertical: tokens.spacing.lg,
      gap: tokens.spacing.sm,
    },
    poweredByText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    poweredByLogos: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.sm,
    },
    poweredByLogoPressable: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    poweredByAmpersand: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
  });
}

export type SettingsStyles = ReturnType<typeof createSettingsStyles>;
