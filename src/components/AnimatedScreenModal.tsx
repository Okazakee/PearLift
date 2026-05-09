import { type ReactNode, useEffect, useState } from 'react';
import {
  Modal,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MOTION } from '@/animation/motion';
import { AnimatedSlideInRightView } from '@/animation/primitives';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

interface AnimatedScreenModalProps {
  open: boolean;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  presentation?: 'fullscreen' | 'tablet-sheet';
  maxWidth?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

const UNMOUNT_DELAY_MS = MOTION.duration.base;

export function AnimatedScreenModal({
  open,
  onClose,
  style,
  presentation = 'fullscreen',
  maxWidth,
  contentContainerStyle,
  children,
}: AnimatedScreenModalProps) {
  const layout = useResponsiveLayout();
  const [modalVisible, setModalVisible] = useState(open);
  const [contentVisible, setContentVisible] = useState(open);
  const asTabletSheet = presentation === 'tablet-sheet' && layout.isTablet;

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
      <View style={styles.root}>
        {contentVisible ? (
          <GestureHandlerRootView style={styles.gestureRoot}>
            <View
              style={[
                styles.viewport,
                asTabletSheet && styles.viewportTabletSheet,
                contentContainerStyle,
              ]}
            >
              <AnimatedSlideInRightView
                style={[
                  styles.screen,
                  asTabletSheet && styles.screenTabletSheet,
                  asTabletSheet && {
                    maxWidth: maxWidth ?? layout.modalMaxWidth,
                  },
                  style,
                ]}
              >
                {children}
              </AnimatedSlideInRightView>
            </View>
          </GestureHandlerRootView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  gestureRoot: {
    flex: 1,
  },
  viewport: {
    flex: 1,
  },
  viewportTabletSheet: {
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  screen: {
    flex: 1,
  },
  screenTabletSheet: {
    width: '100%',
    flexGrow: 0,
    maxHeight: '94%',
    borderRadius: 24,
    overflow: 'hidden',
  },
});
