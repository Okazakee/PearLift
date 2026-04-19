import { Feather } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  ReduceMotion,
} from 'react-native-reanimated';
import { MOTION } from '../animation/motion';
import { AnimatedPressable } from '../animation/primitives';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';

interface OnboardingScreenProps {
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  onComplete: () => void;
}

const PAGE_COUNT = 3;

const PAGE_CONTENT = [
  {
    icon: 'activity' as const,
    title: 'Welcome to PearLift',
    description:
      'Track your workouts with a simple interface. Log sets, reps, and weights - no complexity, just progress.',
  },
  {
    icon: 'monitor' as const,
    title: 'Device-to-Device Sync',
    description:
      'Sync your workouts directly between devices. Set it up anytime in Settings. Works locally without cloud services.',
  },
  {
    icon: 'bell' as const,
    title: 'Stay on Track',
    description:
      'Enable notifications so you never forget a rest timer. We will remind you when its time to start your next set.',
  },
] as const;

export function OnboardingScreen({
  tokens,
  topInset,
  bottomInset,
  onComplete,
}: OnboardingScreenProps) {
  const [page, setPage] = useState(0);
  const [requesting, setRequesting] = useState(false);

  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );

  const content = PAGE_CONTENT[page];
  const isLastPage = page === PAGE_COUNT - 1;
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
            key={content.title}
            style={[
              styles.dot,
              i <= page ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>

      <Animated.View
        key={content.title}
        style={styles.content}
        entering={FadeInDown.duration(MOTION.duration.base).reduceMotion(
          ReduceMotion.System,
        )}
        exiting={FadeOutUp.duration(MOTION.duration.fast).reduceMotion(
          ReduceMotion.System,
        )}
      >
        <View style={styles.iconContainer}>
          <Feather
            name={PAGE_CONTENT[page].icon}
            size={56}
            color={tokens.colors.primary}
          />
        </View>

        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.description}>{content.description}</Text>
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
            Back
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
                ? 'Setting up...'
                : 'Get Started'
              : 'Next'}
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
