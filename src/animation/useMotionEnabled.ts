import { useReducedMotion } from 'react-native-reanimated';

export function useMotionEnabled() {
  const reducedMotion = useReducedMotion();
  return !reducedMotion;
}
