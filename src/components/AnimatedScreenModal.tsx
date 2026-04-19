import { type ReactNode, useEffect, useState } from 'react';
import {
  Modal,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { MOTION } from '../animation/motion';
import { AnimatedSlideInRightView } from '../animation/primitives';

interface AnimatedScreenModalProps {
  open: boolean;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

const UNMOUNT_DELAY_MS = MOTION.duration.base;

export function AnimatedScreenModal({
  open,
  onClose,
  style,
  children,
}: AnimatedScreenModalProps) {
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
      <View style={styles.root}>
        {contentVisible ? (
          <AnimatedSlideInRightView style={[styles.screen, style]}>
            {children}
          </AnimatedSlideInRightView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
});
