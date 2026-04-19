import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayIconMap } from '../data/workouts';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';
import type { DayConfig, WorkoutDay } from '../types';

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
  const styles = createStyles(tokens, bottomPadding, minHeight);

  return (
    <View style={styles.container}>
      {dayConfigs.map((day) => {
        const active = currentDay === day.id;
        const iconName = dayIconMap[day.icon] ?? 'fitness-center';

        return (
          <Pressable
            key={day.id}
            onPress={() => onDayChange(day.id)}
            style={styles.item}
            android_ripple={{
              color: withAlpha(tokens.colors.primary, 0.12),
              radius: 22,
              borderless: false,
            }}
          >
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
              <Feather
                name={iconName as never}
                size={20}
                color={
                  active
                    ? tokens.colors.accentPrimary
                    : tokens.colors.textSecondary
                }
              />
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>
              {day.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(
  tokens: ThemeTokens,
  bottomPadding: number,
  minHeight: number,
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
      paddingTop: tokens.spacing.xs,
      paddingBottom: bottomPadding,
      minHeight,
      flexDirection: 'row',
    },
    item: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: tokens.spacing.xs,
      gap: 2,
      borderRadius: tokens.radius.pill,
      overflow: 'hidden',
    },
    iconWrap: {
      width: 40,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    iconWrapActive: {
      backgroundColor: tokens.colors.primaryContainer,
    },
    label: {
      color: tokens.colors.textSecondary,
      fontSize: 10.5,
      fontFamily: 'SpaceGrotesk_500Medium',
    },
    labelActive: {
      color: tokens.colors.primary,
      fontFamily: 'SpaceGrotesk_600SemiBold',
    },
  });
}
