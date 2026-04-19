import { type ReactNode, useEffect, useRef, useState } from 'react';
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
const CONTENT_MOUNT_DELAY_MS = 24;

export function AnimatedScreenModal({
  open,
  onClose,
  style,
  children,
}: AnimatedScreenModalProps) {
  const [modalVisible, setModalVisible] = useState(open);
  const [contentVisible, setContentVisible] = useState(open);
  const [childrenMounted, setChildrenMounted] = useState(open);
  const mountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mountTimerRef.current) {
      clearTimeout(mountTimerRef.current);
      mountTimerRef.current = null;
    }
    if (open) {
      setModalVisible(true);
      setContentVisible(true);
      mountTimerRef.current = setTimeout(() => {
        mountTimerRef.current = null;
        setChildrenMounted(true);
      }, CONTENT_MOUNT_DELAY_MS);
      return;
    }
    setContentVisible(false);
    const timer = setTimeout(() => {
      setChildrenMounted(false);
      setModalVisible(false);
    }, UNMOUNT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (mountTimerRef.current) {
        clearTimeout(mountTimerRef.current);
      }
    };
  }, []);

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
            {childrenMounted ? children : <View style={styles.warmup} />}
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
  warmup: {
    flex: 1,
  },
});
