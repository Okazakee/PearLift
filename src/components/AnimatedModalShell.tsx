import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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
const CONTENT_MOUNT_DELAY_MS = 24;

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

  const rootStyle = useMemo(() => styles.modalRoot, []);

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={[rootStyle, containerStyle]}>
        {contentVisible ? (
          <>
            <AnimatedFadeInView style={backdropStyle}>
              <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            </AnimatedFadeInView>
            <AnimatedSlideInView style={sheetStyle}>
              {childrenMounted ? children : <View style={styles.warmup} />}
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
  warmup: {
    minHeight: 140,
  },
});
