import {
  Activity,
  Clock,
  Dumbbell,
  Flame,
  Heart,
  Navigation as NavigationIcon,
  RefreshCw,
  Repeat,
  Star,
} from 'lucide-react-native';
import type React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { E2E_IDS } from '@/config/testIds';
import { dayIconMap } from '@/data/workouts';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import type { DayConfig, WorkoutDay } from '@/types';
import { Text } from './AppText';

const iconComponents: Record<
  string,
  React.ComponentType<{ size: number; color: string }>
> = {
  Activity,
  Clock,
  Dumbbell,
  Flame,
  Heart,
  Navigation: NavigationIcon,
  RefreshCw,
  Repeat,
  Star,
};

interface NavigationProps {
  tokens: ThemeTokens;
  currentDay: WorkoutDay;
  dayConfigs: DayConfig[];
  onDayChange: (day: WorkoutDay) => void;
  bottomPadding: number;
  minHeight: number;
}

export function Navigation({
  tokens,
  currentDay,
  dayConfigs,
  onDayChange,
  bottomPadding,
  minHeight,
}: NavigationProps) {
  const layout = useResponsiveLayout();
  const styles = createStyles(
    tokens,
    bottomPadding,
    minHeight,
    layout.isTablet,
  );
  const itemWidth = Math.max(
    layout.isTablet ? 52 : 56,
    (Math.min(layout.width, layout.contentMaxWidth) - tokens.spacing.xs * 2) /
      Math.max(1, dayConfigs.length),
  );

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {dayConfigs.map((item) => {
          const active = currentDay === item.id;
          const IconComponent = iconComponents[dayIconMap[item.icon]];
          return (
            <Pressable
              key={item.id}
              onPress={() => onDayChange(item.id)}
              style={[styles.item, { width: itemWidth }]}
              testID={E2E_IDS.navigation.day(item.id)}
              android_ripple={{
                color: withAlpha(tokens.colors.primary, 0.12),
                radius: 22,
                borderless: false,
              }}
            >
              <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                {IconComponent && (
                  <IconComponent
                    size={20}
                    color={
                      active
                        ? tokens.colors.accentPrimary
                        : tokens.colors.textSecondary
                    }
                  />
                )}
              </View>
              <Text style={[styles.label, active && styles.labelActive]}>
                {item.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(
  tokens: ThemeTokens,
  bottomPadding: number,
  minHeight: number,
  isTablet: boolean,
) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopWidth: 1,
      borderTopColor: tokens.colors.borderSubtle,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.xs,
      paddingTop: isTablet ? 2 : tokens.spacing.xs,
      paddingBottom: bottomPadding,
      minHeight,
      flexDirection: 'row',
    },
    row: {
      flexDirection: 'row',
      width: '100%',
      justifyContent: 'center',
    },
    item: {
      alignItems: 'center',
      paddingVertical: isTablet ? 2 : tokens.spacing.xs,
      gap: isTablet ? 1 : 2,
      borderRadius: tokens.radius.pill,
      overflow: 'hidden',
    },
    iconWrap: {
      width: isTablet ? 36 : 40,
      height: isTablet ? 24 : 28,
      borderRadius: isTablet ? 12 : 14,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    iconWrapActive: {
      backgroundColor: tokens.colors.primaryContainer,
    },
    label: {
      color: tokens.colors.textSecondary,
      fontSize: isTablet ? 10 : 10.5,
      fontFamily: 'SpaceGrotesk_500Medium',
      textAlign: 'center',
      flexShrink: 1,
    },
    labelActive: {
      color: tokens.colors.primary,
      fontFamily: 'SpaceGrotesk_600SemiBold',
    },
  });
}
