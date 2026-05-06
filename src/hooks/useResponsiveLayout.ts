import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

const TABLET_BREAKPOINT = 768;
const TABLET_PORTRAIT_MAX_WIDTH = 860;
const TABLET_LANDSCAPE_MAX_WIDTH = 960;
const TABLET_MODAL_MAX_WIDTH = 760;
const EXERCISE_CARD_MIN_WIDTH = 320;

export interface ResponsiveLayout {
  width: number;
  height: number;
  isTablet: boolean;
  isLandscape: boolean;
  isPortrait: boolean;
  contentMaxWidth: number;
  formMaxWidth: number;
  modalMaxWidth: number;
  exerciseColumns: number;
}

export function useResponsiveLayout(): ResponsiveLayout {
  const window = useWindowDimensions();

  return useMemo(() => {
    const width = window.width;
    const height = window.height;
    const shortEdge = Math.min(width, height);
    const isTablet = shortEdge >= TABLET_BREAKPOINT;
    const isLandscape = width > height;
    const isPortrait = !isLandscape;
    const contentMaxWidth =
      isTablet && isLandscape
        ? TABLET_LANDSCAPE_MAX_WIDTH
        : isTablet
          ? TABLET_PORTRAIT_MAX_WIDTH
          : width;
    const formMaxWidth =
      isTablet && isLandscape
        ? TABLET_LANDSCAPE_MAX_WIDTH
        : isTablet
          ? TABLET_PORTRAIT_MAX_WIDTH
          : width;
    const modalMaxWidth = isTablet ? TABLET_MODAL_MAX_WIDTH : width;
    const availableWorkoutWidth =
      Math.min(width, contentMaxWidth) - (isTablet && isLandscape ? 32 : 24);
    const exerciseColumns = !isTablet
      ? 1
      : availableWorkoutWidth >= EXERCISE_CARD_MIN_WIDTH * 3
        ? 3
        : 2;

    return {
      width,
      height,
      isTablet,
      isLandscape,
      isPortrait,
      contentMaxWidth,
      formMaxWidth,
      modalMaxWidth,
      exerciseColumns,
    };
  }, [window.height, window.width]);
}
