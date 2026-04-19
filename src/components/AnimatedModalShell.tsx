import { type ReactNode, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { MOTION } from '../animation/motion';
import {
  AnimatedFadeInView,
  AnimatedSlideInView,
} from '../animation/primitives';

interface AnimatedModalShellProps {
  open: boolean;
  onClose: () => void;
  backdropStyle: ViewStyle;
  sheetStyle: ViewStyle;
  containerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

const UNMOUNT_DELAY_MS = MOTION.duration.base;

export function AnimatedModalShell({
  open,
  onClose,
  backdropStyle,
  sheetStyle,
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
      onRequestClose={onClose}
    >
      <View style={[styles.modalRoot, containerStyle]}>
        {contentVisible ? (
          <>
            <AnimatedFadeInView style={backdropStyle}>
              <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            </AnimatedFadeInView>
            <AnimatedSlideInView style={sheetStyle}>
              {children}
            </AnimatedSlideInView>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
