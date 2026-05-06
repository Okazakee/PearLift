import { type ReactNode, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MOTION } from '../animation/motion';
import {
  AnimatedFadeInView,
  AnimatedSlideInRightView,
  AnimatedSlideInView,
} from '../animation/primitives';

interface AnimatedModalShellProps {
  open: boolean;
  onClose: () => void;
  backdropStyle: ViewStyle;
  sheetStyle: ViewStyle;
  slideFrom?: 'bottom' | 'right';
  containerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

const UNMOUNT_DELAY_MS = MOTION.duration.base;

export function AnimatedModalShell({
  open,
  onClose,
  backdropStyle,
  sheetStyle,
  slideFrom = 'bottom',
  containerStyle,
  children,
}: AnimatedModalShellProps) {
  const [modalVisible, setModalVisible] = useState(open);
  const [contentVisible, setContentVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setModalVisible(true);
      setContentVisible(true);
      return;
    }

    setContentVisible(false);
    const timer = setTimeout(() => {
      setModalVisible(false);
    }, UNMOUNT_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [open]);

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={[styles.modalRoot, containerStyle]}>
        {contentVisible ? (
          <>
            <AnimatedFadeInView style={backdropStyle}>
              <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            </AnimatedFadeInView>
            {slideFrom === 'right' ? (
              <AnimatedSlideInRightView
                style={[styles.rightPanelSheet, sheetStyle]}
              >
                {children}
              </AnimatedSlideInRightView>
            ) : (
              <AnimatedSlideInView style={sheetStyle}>
                {children}
              </AnimatedSlideInView>
            )}
          </>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightPanelSheet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
  },
});
