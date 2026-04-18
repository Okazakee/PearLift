import { MaterialIcons } from '@expo/vector-icons';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';

interface RestTimerProps {
  tokens: ThemeTokens;
  duration: number;
  onDurationChange: (duration: number) => void;
  fabBottom: number;
  panelBottom: number;
  onExpandedChange?: (isOpen: boolean) => void;
}

const MIN_DURATION = 30;
const MAX_DURATION = 600;
const STEP = 15;

const COMPLETION_SOUND =
  'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleW1mcYaGflxTYYqhtax6USpFjMvl3LKBXlxjdIGCd2RjcIqgtLSMakVFhLbZ48CghXlxcnl2alZcc46fr6+TdE9Hi7XI0sGnmY+IhYN8bmBeZ3+PlZ2ejnhdd5i60t3MubKsnp2bkYV0ZWVte4SNk5KKfm5rgZ2vvsrFu7KtrK6poZWIeXRzd36EioqGgHhxcIWcr7zBvba0s7W2saqfi4J9fX9/gYKBfnp3d4GUnKm2vL27ubq7u7mvn46Bf39/f39+fXt4dXiBkZyqtr3Avrq4t7W0rKCUiYOBgIB+fHp4dXN4hJOgrrm+v7y3s7CtqaWckoqFg4KBf316eHZ3fIqXo6+5vL26trKuqqahmZGLhoSCgX99e3l4eHyGk5+rsbi6uLWyr6yppZ6WjoiFg4GAfnt5eHl+h5OeqLK3t7azsK2qqKSfmJCKhoOBf358enl5fYaSmqWusbKxr62rqainop2Vj4qGg4F/fXt6en2FkJiks7e5t7SxrquopaGbk42IhYOAfn17e3x/iJObpK6ztLOwr6yqp6Sgm5SNiYWDgH5+fHt9gYqTm6OrsLGwra2rqaeinpqUjoqGg4GAf359fYGIkJeeo6iqqqmopaOhnpuXkY2JhoOBgH9+f4GGjJKYnqGjoqGgn52bmJWRjouIhoSCgYCAgoSIjZGWmZubnJuamJeVk5COi4mHhYSDg4OEhomMj5KUlZWVlJOSkI+NjIqJiIeGhoaGh4mKjI6PkJCQkI+Ojo2MjIuKioqJiYmJiouMjY6Ojo6OjY2NjYyMjIuLi4uLi4uLjIyMjY2NjY2NjY2NjY2NjYyMjIyMjIyMjIyMjIyMjI2NjY2NjY2NjY2NjY2NjY2NjYyM';

let completionSoundRef: Audio.Sound | null = null;

function formatSeconds(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function prepareCompletionSound() {
  if (completionSoundRef) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    });
    const { sound } = await Audio.Sound.createAsync(
      { uri: COMPLETION_SOUND },
      { shouldPlay: false },
    );
    completionSoundRef = sound;
  } catch {
    // ignore initialization failures
  }
}

async function playCompletionSound() {
  if (!completionSoundRef) {
    await prepareCompletionSound();
  }
  if (!completionSoundRef) return;
  try {
    await completionSoundRef.setPositionAsync(0);
    await completionSoundRef.playAsync();
  } catch {
    // ignore playback failures
  }
}

function triggerCompletionFeedback() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  if (Platform.OS === 'web') {
    navigator.vibrate([200, 100, 200, 100, 200]);
  } else {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

export function RestTimer({
  tokens,
  duration,
  onDurationChange,
  fabBottom,
  panelBottom,
  onExpandedChange,
}: RestTimerProps) {
  const [expanded, setExpanded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [timeLeft, setTimeLeft] = useState(duration);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completionSignaledRef = useRef(false);

  const isComplete = timeLeft === 0 && !isRunning;
  const styles = useMemo(
    () => createStyles(tokens, isComplete, fabBottom, panelBottom),
    [tokens, isComplete, fabBottom, panelBottom],
  );

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    if (!isRunning) {
      setTimeLeft((current) => {
        if (current > duration) {
          return duration;
        }
        return current;
      });
    }
  }, [duration, isRunning]);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            completionSignaledRef.current = true;
            setIsRunning(false);
            void playCompletionSound();
            triggerCompletionFeedback();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, timeLeft]);

  useEffect(() => {
    if (isRunning) {
      try {
        void activateKeepAwakeAsync();
      } catch {
        // ignore if activity unavailable
      }
    } else {
      try {
        deactivateKeepAwake();
      } catch {
        // ignore if activity unavailable
      }
    }
  }, [isRunning]);

  const progress = duration > 0 ? ((duration - timeLeft) / duration) * 100 : 0;

  const handleToggleRunning = () => {
    if (timeLeft === 0) {
      setTimeLeft(duration);
    }
    setIsRunning((prev) => !prev);
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(duration);
  };

  const handleAdjustDuration = (delta: number) => {
    const newDuration = Math.max(
      MIN_DURATION,
      Math.min(MAX_DURATION, duration + delta),
    );
    onDurationChange(newDuration);
    if (!isRunning) {
      setTimeLeft(newDuration);
    }
  };

  const handleSliderChange = (value: number) => {
    onDurationChange(value);
    if (!isRunning) {
      setTimeLeft(value);
    }
  };

  if (!expanded) {
    return (
      <Pressable style={styles.fab} onPress={() => setExpanded(true)}>
        <MaterialIcons name="timer" size={24} color={tokens.colors.onPrimary} />
      </Pressable>
    );
  }

  return (
    <View style={styles.panelContainer}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialIcons
              name="timer"
              size={18}
              color={tokens.colors.textPrimary}
            />
            <Text style={styles.headerText}>Rest Timer</Text>
          </View>
          <Pressable
            style={styles.closeButton}
            onPress={() => setExpanded(false)}
          >
            <MaterialIcons
              name="close"
              size={18}
              color={tokens.colors.textSecondary}
            />
          </Pressable>
        </View>

        <View style={styles.timerSection}>
          <View style={styles.circleOuter}>
            <View
              style={[styles.circleInner, isComplete && styles.circleComplete]}
            >
              <Text
                style={[
                  styles.timerText,
                  isComplete && styles.timerTextComplete,
                ]}
              >
                {formatSeconds(timeLeft)}
              </Text>
              {isComplete && (
                <Text style={styles.doneText}>REST COMPLETE!</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        <View style={styles.controlRow}>
          <Pressable style={styles.controlButton} onPress={handleReset}>
            <MaterialIcons
              name="replay"
              size={22}
              color={tokens.colors.textPrimary}
            />
          </Pressable>
          <Pressable
            style={[styles.playButton, isRunning && styles.playButtonRunning]}
            onPress={handleToggleRunning}
          >
            <MaterialIcons
              name={isRunning ? 'pause' : 'play-arrow'}
              size={28}
              color={
                isRunning
                  ? tokens.colors.accentWarning
                  : tokens.colors.onPrimary
              }
            />
          </Pressable>
          <Pressable
            style={[
              styles.controlButton,
              showSettings && styles.controlButtonActive,
            ]}
            onPress={() => setShowSettings(!showSettings)}
          >
            <MaterialIcons
              name="tune"
              size={22}
              color={
                showSettings ? tokens.colors.primary : tokens.colors.textPrimary
              }
            />
          </Pressable>
        </View>

        {showSettings && (
          <View style={styles.settingsSection}>
            <Text style={styles.settingsLabel}>Adjust rest duration</Text>
            <View style={styles.sliderRow}>
              <Pressable
                style={styles.adjustButton}
                onPress={() => handleAdjustDuration(-STEP)}
                disabled={duration <= MIN_DURATION}
              >
                <MaterialIcons
                  name="remove"
                  size={18}
                  color={tokens.colors.textPrimary}
                />
              </Pressable>
              <View style={styles.sliderContainer}>
                <View style={styles.sliderTrack}>
                  <View
                    style={[
                      styles.sliderFill,
                      {
                        width: `${
                          ((duration - MIN_DURATION) /
                            (MAX_DURATION - MIN_DURATION)) *
                          100
                        }%`,
                      },
                    ]}
                  />
                </View>
                <Pressable
                  style={styles.sliderTouch}
                  onPress={(e) => {
                    const { locationX } = e.nativeEvent;
                    const totalWidth = 200;
                    const ratio = locationX / totalWidth;
                    const newDuration = Math.round(
                      MIN_DURATION + ratio * (MAX_DURATION - MIN_DURATION),
                    );
                    const snapped = Math.round(newDuration / STEP) * STEP;
                    handleSliderChange(
                      Math.max(MIN_DURATION, Math.min(MAX_DURATION, snapped)),
                    );
                  }}
                />
              </View>
              <Pressable
                style={styles.adjustButton}
                onPress={() => handleAdjustDuration(STEP)}
                disabled={duration >= MAX_DURATION}
              >
                <MaterialIcons
                  name="add"
                  size={18}
                  color={tokens.colors.textPrimary}
                />
              </Pressable>
            </View>
            <Text style={styles.durationText}>{formatSeconds(duration)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function createStyles(
  tokens: ThemeTokens,
  isComplete: boolean,
  fabBottom: number,
  panelBottom: number,
) {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 20,
      bottom: fabBottom,
      width: 54,
      height: 54,
      borderRadius: 16,
      backgroundColor: isComplete
        ? tokens.colors.success
        : withAlpha(tokens.colors.primary, 0.95),
      alignItems: 'center',
      justifyContent: 'center',
    },
    panelContainer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: panelBottom,
      paddingHorizontal: tokens.spacing.lg,
      alignItems: 'center',
    },
    panel: {
      width: '100%',
      maxWidth: 340,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: withAlpha(tokens.colors.surfaceContainer, 0.98),
      padding: tokens.spacing.lg,
      gap: tokens.spacing.md,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
    },
    headerText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
    closeButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timerSection: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: tokens.spacing.sm,
    },
    circleOuter: {
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: withAlpha(tokens.colors.primary, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    circleInner: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: tokens.colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    circleComplete: {
      backgroundColor: withAlpha(tokens.colors.success, 0.15),
    },
    timerText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.metric,
      fontWeight: '800',
    },
    timerTextComplete: {
      color: tokens.colors.success,
    },
    doneText: {
      color: tokens.colors.success,
      fontSize: 10,
      fontWeight: '700',
    },
    progressTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: withAlpha(tokens.colors.primary, 0.15),
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: isComplete
        ? tokens.colors.success
        : tokens.colors.primary,
      borderRadius: 2,
    },
    controlRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: tokens.spacing.lg,
    },
    controlButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: withAlpha(tokens.colors.textPrimary, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    controlButtonActive: {
      backgroundColor: withAlpha(tokens.colors.primary, 0.2),
    },
    playButton: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playButtonRunning: {
      backgroundColor: withAlpha(tokens.colors.accentWarning, 0.2),
    },
    settingsSection: {
      paddingTop: tokens.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: tokens.colors.outlineVariant,
      gap: tokens.spacing.sm,
    },
    settingsLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '600',
    },
    sliderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.md,
    },
    adjustButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: withAlpha(tokens.colors.textPrimary, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    sliderContainer: {
      flex: 1,
      height: 36,
      justifyContent: 'center',
      position: 'relative',
    },
    sliderTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: withAlpha(tokens.colors.primary, 0.15),
      overflow: 'hidden',
    },
    sliderFill: {
      height: '100%',
      backgroundColor: tokens.colors.primary,
      borderRadius: 3,
    },
    sliderTouch: {
      ...StyleSheet.absoluteFillObject,
    },
    durationText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
}
