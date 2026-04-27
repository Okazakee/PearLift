import * as Notifications from 'expo-notifications';
import { Activity, Bell, Sliders } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  ReduceMotion,
} from 'react-native-reanimated';
import { MOTION } from '../animation/motion';
import { AnimatedPressable } from '../animation/primitives';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';
import type { WeightUnit } from '../types';

interface OnboardingScreenProps {
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  weightUnit: WeightUnit;
  onWeightUnitChange: (next: WeightUnit) => void;
  onComplete: () => void;
}

const PAGE_CONTENT = [
  {
    icon: Activity,
    titleKey: 'onboarding.pages.welcome.title',
    descriptionKey: 'onboarding.pages.welcome.description',
    kind: 'normal' as const,
  },
  {
    icon: Sliders,
    titleKey: 'onboarding.pages.units.title',
    descriptionKey: 'onboarding.pages.units.description',
    kind: 'units' as const,
  },
  {
    icon: Bell,
    titleKey: 'onboarding.pages.notifications.title',
    descriptionKey: 'onboarding.pages.notifications.description',
    kind: 'normal' as const,
  },
] as const;

export function OnboardingScreen({
  tokens,
  topInset,
  bottomInset,
  weightUnit,
  onWeightUnitChange,
  onComplete,
}: OnboardingScreenProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [requesting, setRequesting] = useState(false);

  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );

  const content = PAGE_CONTENT[page];
  const isLastPage = page === PAGE_CONTENT.length - 1;
  const isFirstPage = page === 0;

  const handleNext = async () => {
    if (isLastPage) {
      if (!requesting) {
        setRequesting(true);
        await Notifications.requestPermissionsAsync();
      }
      return;
    }
    setPage((p) => p + 1);
  };

  useEffect(() => {
    if (requesting && isLastPage) {
      onComplete();
    }
  }, [requesting, isLastPage, onComplete]);

  const handleBack = () => {
    if (isFirstPage) return;
    setPage((p) => p - 1);
  };

  return (
    <View style={styles.root}>
      <View style={styles.pageIndicator}>
        {PAGE_CONTENT.map((content, i) => (
          <View
            key={content.titleKey}
            style={[
              styles.dot,
              i <= page ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>

      <Animated.View
        key={content.titleKey}
        style={styles.content}
        entering={FadeInDown.duration(MOTION.duration.base).reduceMotion(
          ReduceMotion.System,
        )}
        exiting={FadeOutUp.duration(MOTION.duration.fast).reduceMotion(
          ReduceMotion.System,
        )}
      >
        <View style={styles.iconContainer}>
          {page === 0 ? (
            <Image
              source={require('../../assets/pearlift_transparent.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          ) : (
            React.createElement(PAGE_CONTENT[page].icon, {
              size: 56,
              color: tokens.colors.primary,
            })
          )}
        </View>

        <Text style={styles.title}>{t(content.titleKey)}</Text>
        <Text style={styles.description}>{t(content.descriptionKey)}</Text>

        {content.kind === 'units' && (
          <View style={styles.unitRow}>
            <AnimatedPressable
              style={[
                styles.unitOption,
                weightUnit === 'kg' && styles.unitOptionActive,
              ]}
              onPress={() => onWeightUnitChange('kg')}
            >
              <Text
                style={[
                  styles.unitOptionText,
                  weightUnit === 'kg' && styles.unitOptionTextActive,
                ]}
              >
                kg
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[
                styles.unitOption,
                weightUnit === 'lb' && styles.unitOptionActive,
              ]}
              onPress={() => onWeightUnitChange('lb')}
            >
              <Text
                style={[
                  styles.unitOptionText,
                  weightUnit === 'lb' && styles.unitOptionTextActive,
                ]}
              >
                lb
              </Text>
            </AnimatedPressable>
          </View>
        )}
      </Animated.View>

      <View style={styles.footer}>
        <AnimatedPressable
          style={[styles.backButton, isFirstPage && styles.buttonDisabled]}
          onPress={handleBack}
          disabled={isFirstPage}
        >
          <Text
            style={[styles.backButtonText, isFirstPage && styles.textDisabled]}
          >
            {t('common.back')}
          </Text>
        </AnimatedPressable>

        <AnimatedPressable
          style={[styles.nextButton, requesting && styles.buttonDisabled]}
          onPress={handleNext}
          disabled={requesting}
        >
          <Text style={styles.nextButtonText}>
            {isLastPage
              ? requesting
                ? t('onboarding.settingUp')
                : t('onboarding.getStarted')
              : t('common.next')}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function createStyles(
  tokens: ThemeTokens,
  topInset: number,
  bottomInset: number,
) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: tokens.colors.bgBase,
      paddingTop: topInset,
      paddingHorizontal: tokens.spacing.lg,
    },
    pageIndicator: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
      paddingTop: tokens.spacing.xl,
    },
    dot: {
      height: 4,
      borderRadius: 2,
    },
    dotActive: {
      width: 24,
      backgroundColor: tokens.colors.primary,
    },
    dotInactive: {
      width: 8,
      backgroundColor: tokens.colors.outlineVariant,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: tokens.spacing.lg,
    },
    iconContainer: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: withAlpha(tokens.colors.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: tokens.spacing.xl,
    },
    logoImage: {
      width: 80,
      height: 80,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.title,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: tokens.spacing.md,
    },
    description: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      lineHeight: 22,
      textAlign: 'center',
    },
    unitRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.xl,
    },
    unitOption: {
      minWidth: 96,
      paddingVertical: tokens.spacing.sm,
      borderRadius: tokens.radius.pill,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unitOptionActive: {
      borderColor: 'transparent',
      backgroundColor: withAlpha(tokens.colors.primary, 0.16),
    },
    unitOptionText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    unitOptionTextActive: {
      color: tokens.colors.primary,
    },
    footer: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      paddingBottom: bottomInset + tokens.spacing.lg,
    },
    backButton: {
      minHeight: 48,
      minWidth: 80,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.surfaceContainerHigh,
    },
    backButtonText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
    nextButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nextButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    textDisabled: {
      color: tokens.colors.textMuted,
    },
  });
}
