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
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import DraggableFlatList, {
  type RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { dayIconMap } from '../data/workouts';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';
import type { DayConfig, WorkoutDay } from '../types';
import { scheduleIdleTask } from '../utils/idle';

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
  const pendingPersistCancelRef = useRef<(() => void) | null>(null);
  const pendingPersistOrderRef = useRef<DayConfig[] | null>(null);
  const [draftDayConfigs, setDraftDayConfigs] = useState(dayConfigs);

  const sameOrder = useCallback((a: DayConfig[], b: DayConfig[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i]?.id !== b[i]?.id) return false;
    }
    return true;
  }, []);

  useEffect(
    () => () => {
      pendingPersistCancelRef.current?.();
      pendingPersistCancelRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const pendingOrder = pendingPersistOrderRef.current;
    if (pendingOrder && sameOrder(dayConfigs, pendingOrder)) {
      pendingPersistOrderRef.current = null;
      return;
    }

    if (pendingOrder) {
      return;
    }

    if (!sameOrder(dayConfigs, draftDayConfigs)) {
      setDraftDayConfigs(dayConfigs);
    }
  }, [dayConfigs, draftDayConfigs, sameOrder]);

  const window = useWindowDimensions();
  const styles = createStyles(tokens, bottomPadding, minHeight);
  const itemWidth = Math.max(
    56,
    (window.width - tokens.spacing.xs * 2) /
      Math.max(1, draftDayConfigs.length),
  );

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

  return (
    <View style={styles.container}>
      <DraggableFlatList
        data={draftDayConfigs}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        activationDistance={12}
        onDragEnd={({ data, from, to }) => {
          if (from === to) return;
          setDraftDayConfigs(data);
          pendingPersistOrderRef.current = data;
          pendingPersistCancelRef.current?.();
          pendingPersistCancelRef.current = scheduleIdleTask(() => {
            pendingPersistCancelRef.current = null;
            onReorderDayConfigs(data);
          });
        }}
        renderItem={({ item, drag, isActive }: RenderItemParams<DayConfig>) => {
          const active = currentDay === item.id;
          const IconComponent = iconComponents[dayIconMap[item.icon]];

          return (
            <ScaleDecorator>
              <Pressable
                onPress={() => onDayChange(item.id)}
                onLongPress={drag}
                delayLongPress={160}
                style={[
                  styles.item,
                  { width: itemWidth },
                  isActive && styles.itemActive,
                ]}
                android_ripple={{
                  color: withAlpha(tokens.colors.primary, 0.12),
                  radius: 22,
                  borderless: false,
                }}
              >
                <View
                  style={[styles.iconWrap, active && styles.iconWrapActive]}
                >
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
            </ScaleDecorator>
          );
        }}
      />
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
    list: {
      flex: 1,
    },
    listContent: {
      flexGrow: 1,
    },
    item: {
      alignItems: 'center',
      paddingVertical: tokens.spacing.xs,
      gap: 2,
      borderRadius: tokens.radius.pill,
      overflow: 'hidden',
    },
    itemActive: {
      opacity: 0.92,
      transform: [{ scale: 1.04 }],
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
