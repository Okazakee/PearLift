import { Layers3, X } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AnimatedModalShell } from '@/components/AnimatedModalShell';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import type { ProgramSummary } from '@/types';
import { Text } from '../AppText';

interface ProgramLibraryModalProps {
  open: boolean;
  tokens: ThemeTokens;
  programs: ProgramSummary[];
  onClose: () => void;
  onSelectProgram: (programId: string) => void;
}

function formatProgramMeta(program: ProgramSummary) {
  const parts: string[] = [];

  if (program.subtitle) {
    parts.push(program.subtitle);
  }
  parts.push(`${program.workoutCount} workouts`);
  if (program.durationWeeks) {
    parts.push(`${program.durationWeeks} weeks`);
  }

  return parts.join(' / ');
}

export function ProgramLibraryModal({
  open,
  tokens,
  programs,
  onClose,
  onSelectProgram,
}: ProgramLibraryModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(tokens, layout), [tokens, layout]);

  return (
    <AnimatedModalShell
      open={open}
      onClose={onClose}
      containerStyle={styles.modalRoot}
      backdropStyle={styles.backdrop}
      sheetStyle={styles.card}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Layers3 size={18} color={tokens.colors.primary} />
          <Text style={styles.title}>{t('programLibrary.title')}</Text>
        </View>
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
          <X size={18} color={tokens.colors.textSecondary} />
        </Pressable>
      </View>

      <Text style={styles.summaryText}>
        {t('programLibrary.summary', { count: programs.length })}
      </Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {programs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t('programLibrary.empty')}</Text>
          </View>
        ) : (
          programs.map((program) => (
            <Pressable
              key={program.id}
              style={[
                styles.programCard,
                program.isActive ? styles.programCardActive : null,
              ]}
              onPress={() => onSelectProgram(program.id)}
            >
              <View style={styles.programHeader}>
                <Text style={styles.programName}>{program.name}</Text>
                {program.isActive ? (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>
                      {t('programLibrary.active')}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.programMeta}>
                {formatProgramMeta(program)}
              </Text>
              {program.goal ? (
                <Text style={styles.programGoal}>{program.goal}</Text>
              ) : null}
            </Pressable>
          ))
        )}
      </ScrollView>
    </AnimatedModalShell>
  );
}

function createStyles(
  tokens: ThemeTokens,
  layout: ReturnType<typeof useResponsiveLayout>,
) {
  return StyleSheet.create({
    modalRoot: {
      paddingHorizontal: tokens.spacing.lg,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    card: {
      width: '100%',
      maxWidth: layout.isTablet ? Math.min(layout.modalMaxWidth, 620) : 560,
      maxHeight: '78%',
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
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
    summaryText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
    },
    scroll: {
      maxHeight: 420,
    },
    content: {
      gap: tokens.spacing.sm,
    },
    emptyState: {
      padding: tokens.spacing.md,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: withAlpha(tokens.colors.primary, 0.05),
    },
    emptyText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
    },
    programCard: {
      gap: tokens.spacing.xs,
      padding: tokens.spacing.md,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: withAlpha(tokens.colors.primary, 0.04),
    },
    programCardActive: {
      borderColor: tokens.colors.primary,
      backgroundColor: withAlpha(tokens.colors.primary, 0.1),
    },
    programHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.sm,
    },
    programName: {
      flex: 1,
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    activeBadge: {
      borderRadius: tokens.radius.pill,
      backgroundColor: withAlpha(tokens.colors.primary, 0.14),
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 4,
    },
    activeBadgeText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    programMeta: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    programGoal: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
    },
  });
}
