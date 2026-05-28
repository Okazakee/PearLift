import { Check, Globe, X } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AnimatedModalShell } from '@/components/AnimatedModalShell';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { SUPPORTED_LANGUAGES } from '@/storage';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import { Text } from '../AppText';

interface LanguageListModalProps {
  open: boolean;
  tokens: ThemeTokens;
  selectedLanguage: string;
  onClose: () => void;
  onSelectLanguage: (code: string) => void;
}

export function LanguageListModal({
  open,
  tokens,
  selectedLanguage,
  onClose,
  onSelectLanguage,
}: LanguageListModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(tokens, layout), [tokens, layout]);

  const handleSelect = (code: string) => {
    onSelectLanguage(code);
    onClose();
  };

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
          <Globe size={18} color={tokens.colors.primary} />
          <Text style={styles.title}>{t('settings.appearance.language')}</Text>
        </View>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <X size={18} color={tokens.colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isSelected = selectedLanguage === lang.code;
          return (
            <Pressable
              key={lang.code}
              style={[styles.row, isSelected && styles.rowSelected]}
              onPress={() => handleSelect(lang.code)}
            >
              <Text
                style={[styles.rowTitle, isSelected && styles.rowTitleSelected]}
              >
                {lang.native}
              </Text>
              {isSelected && <Check size={18} color={tokens.colors.primary} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </AnimatedModalShell>
  );
}

const createStyles = (
  tokens: ThemeTokens,
  layout: ReturnType<typeof useResponsiveLayout>,
) =>
  StyleSheet.create({
    modalRoot: {
      paddingHorizontal: tokens.spacing.lg,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    card: {
      width: '100%',
      maxWidth: layout.isTablet ? Math.min(layout.modalMaxWidth, 640) : 580,
      maxHeight: '82%',
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
    list: {
      maxHeight: 360,
    },
    listContent: {
      gap: tokens.spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: tokens.spacing.sm,
      paddingHorizontal: tokens.spacing.md,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.bgSurface,
    },
    rowSelected: {
      backgroundColor: withAlpha(tokens.colors.primary, 0.1),
      borderColor: tokens.colors.primary,
    },
    rowTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '500',
    },
    rowTitleSelected: {
      color: tokens.colors.primary,
      fontWeight: '700',
    },
  });
