import type { ComponentProps, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  type AnimatedProps as ReanimatedAnimatedProps,
  ReduceMotion,
  SlideInDown,
  SlideInRight,
  SlideOutDown,
  SlideOutRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { MOTION } from '@/animation/motion';
import { useMotionEnabled } from '@/animation/useMotionEnabled';

interface AnimatedViewProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
}

interface AnimatedPressableProps
  extends Omit<ComponentProps<typeof Pressable>, 'style'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  pressScale?: number;
  entering?: ReanimatedAnimatedProps<
    ComponentProps<typeof Pressable>
  >['entering'];
  exiting?: ReanimatedAnimatedProps<
    ComponentProps<typeof Pressable>
  >['exiting'];
  layout?: ReanimatedAnimatedProps<ComponentProps<typeof Pressable>>['layout'];
}

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

export function AnimatedFadeInView({
  children,
  style,
  delay = 0,
}: AnimatedViewProps) {
  const motionEnabled = useMotionEnabled();
  return (
    <Animated.View
      style={style}
      entering={
        motionEnabled
          ? FadeIn.duration(MOTION.duration.base)
              .delay(delay)
              .reduceMotion(ReduceMotion.System)
          : undefined
      }
      exiting={
        motionEnabled
          ? FadeOut.duration(MOTION.duration.fast).reduceMotion(
              ReduceMotion.System,
            )
          : undefined
      }
    >
      {children}
    </Animated.View>
  );
}

export function AnimatedSlideInView({
  children,
  style,
  delay = 0,
}: AnimatedViewProps) {
  const motionEnabled = useMotionEnabled();
  return (
    <Animated.View
      style={style}
      entering={
        motionEnabled
          ? SlideInDown.duration(MOTION.duration.base)
              .delay(delay)
              .easing(MOTION.easing.emphasized)
              .reduceMotion(ReduceMotion.System)
          : undefined
      }
      exiting={
        motionEnabled
          ? SlideOutDown.duration(MOTION.duration.fast).reduceMotion(
              ReduceMotion.System,
            )
          : undefined
      }
    >
      {children}
    </Animated.View>
  );
}

export function AnimatedSlideInRightView({
  children,
  style,
  delay = 0,
}: AnimatedViewProps) {
  const motionEnabled = useMotionEnabled();
  return (
    <Animated.View
      style={style}
      entering={
        motionEnabled
          ? SlideInRight.duration(MOTION.duration.base)
              .delay(delay)
              .reduceMotion(ReduceMotion.System)
          : undefined
      }
      exiting={
        motionEnabled
          ? SlideOutRight.duration(MOTION.duration.fast).reduceMotion(
              ReduceMotion.System,
            )
          : undefined
      }
    >
      {children}
    </Animated.View>
  );
}

export function AnimatedPressable({
  children,
  style,
  onPressIn,
  onPressOut,
  pressScale = 0.98,
  ...props
}: AnimatedPressableProps) {
  const motionEnabled = useMotionEnabled();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn: NonNullable<
    ComponentProps<typeof Pressable>['onPressIn']
  > = (event) => {
    if (motionEnabled) {
      scale.value = withTiming(pressScale, {
        duration: MOTION.duration.fast,
        reduceMotion: ReduceMotion.System,
      });
    }
    onPressIn?.(event);
  };

  const handlePressOut: NonNullable<
    ComponentProps<typeof Pressable>['onPressOut']
  > = (event) => {
    if (motionEnabled) {
      scale.value = withTiming(1, {
        duration: MOTION.duration.fast,
        reduceMotion: ReduceMotion.System,
      });
    }
    onPressOut?.(event);
  };

  return (
    <AnimatedPressableBase
      {...props}
      collapsable={false}
      style={[style, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {children}
    </AnimatedPressableBase>
  );
}
