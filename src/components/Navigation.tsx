import {
  Activity,
  Clock,
  Heart,
  Navigation as NavigationIcon,
  RefreshCw,
  Repeat,
  Star,
} from 'lucide-react-native';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Sortable from 'react-native-sortables';
import { dayIconMap } from '../data/workouts';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';
import type { DayConfig, WorkoutDay } from '../types';
import { arraysEqualBy } from '../utils/array';

const iconComponents: Record<
  string,
  React.ComponentType<{ size: number; color: string }>
> = {
  Activity,
  Clock,
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
  onReorderDayConfigs: (value: DayConfig[]) => void;
  bottomPadding: number;
  minHeight: number;
}

export function Navigation({
  tokens,
  currentDay,
  dayConfigs,
  onDayChange,
  onReorderDayConfigs,
  bottomPadding,
  minHeight,
}: NavigationProps) {
  const [draftDayConfigs, setDraftDayConfigs] = useState(dayConfigs);

  useEffect(() => {
    if (!arraysEqualBy(dayConfigs, draftDayConfigs, (d) => d.id)) {
      setDraftDayConfigs(dayConfigs);
    }
  }, [dayConfigs, draftDayConfigs]);

  const window = useWindowDimensions();
  const styles = createStyles(tokens, bottomPadding, minHeight);
  const itemWidth = Math.max(
    56,
    (window.width - tokens.spacing.xs * 2) /
      Math.max(1, draftDayConfigs.length),
  );

  return (
    <View style={styles.container}>
      <Sortable.Flex
        flexDirection="row"
        width="fill"
        dragActivationDelay={300}
        activeItemScale={1.03}
        dropAnimationDuration={200}
        onDragEnd={({ order }) => {
          const reordered = order(draftDayConfigs);
          setDraftDayConfigs(reordered);
          onReorderDayConfigs(reordered);
        }}
      >
        {draftDayConfigs.map((item) => {
          const active = currentDay === item.id;
          const IconComponent = iconComponents[dayIconMap[item.icon]];
          return (
            <Pressable
              key={item.id}
              onPress={() => onDayChange(item.id)}
              style={[styles.item, { width: itemWidth }]}
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
      </Sortable.Flex>
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
