import { useEffect } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { MOTION } from '@/animation/motion';
import { AnimatedFadeInView } from '@/animation/primitives';
import { useMotionEnabled } from '@/animation/useMotionEnabled';
import { Text } from './AppText';

interface BootstrapScreenProps {
  backgroundColor: string;
  accentColor: string;
  title?: string;
  subtitle?: string;
  imageSource: ImageSourcePropType;
  textPrimary?: string;
  textSecondary?: string;
}

export function BootstrapScreen({
  backgroundColor,
  accentColor,
  title,
  subtitle,
  imageSource,
  textPrimary = '#ffffff',
  textSecondary = 'rgba(255,255,255,0.72)',
}: BootstrapScreenProps) {
  const motionEnabled = useMotionEnabled();
  const glowOpacity = useSharedValue(motionEnabled ? 0 : 0.14);

  useEffect(() => {
    glowOpacity.value = withTiming(0.14, {
      duration: motionEnabled ? MOTION.duration.slow : 0,
    });
  }, [glowOpacity, motionEnabled]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <Animated.View
        style={[
          styles.glow,
          glowStyle,
          { backgroundColor: accentColor, top: -80, right: -80 },
        ]}
      />
      <Animated.View
        style={[
          styles.glow,
          glowStyle,
          { backgroundColor: accentColor, bottom: -100, left: -100 },
        ]}
      />

      <AnimatedFadeInView style={styles.content}>
        <View style={[styles.iconRing, { borderColor: accentColor }]}>
          <Image
            source={imageSource}
            style={styles.icon}
            resizeMode="contain"
          />
        </View>

        {title ? (
          <Text style={[styles.title, { color: textPrimary }]}>{title}</Text>
        ) : null}
        {subtitle ? (
          <Text style={[styles.subtitle, { color: textSecondary }]}>
            {subtitle}
          </Text>
        ) : null}
      </AnimatedFadeInView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.14,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconRing: {
    width: 176,
    height: 176,
    borderRadius: 88,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginBottom: 24,
  },
  icon: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 260,
  },
});
