import { Easing } from 'react-native-reanimated';

export const MOTION = {
  duration: {
    fast: 140,
    base: 220,
    slow: 320,
  },
  easing: {
    standard: Easing.bezier(0.2, 0, 0, 1),
    emphasized: Easing.bezier(0.16, 1, 0.3, 1),
  },
  distance: {
    enterY: 8,
    exitY: 6,
  },
} as const;
