import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';

interface RestTimerProps {
  tokens: ThemeTokens;
  duration: number;
  onDurationChange: (value: number) => void;
  fabBottom: number;
  panelBottom: number;
  onExpandedChange?: (expanded: boolean) => void;
}

const MIN_DURATION = 30;
const MAX_DURATION = 600;
const STEP = 15;
const CHANNEL_ID = 'rest-timer';

let notificationHandlerConfigured = false;
let notificationChannelConfigured = false;

function formatSeconds(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getRemainingSeconds(targetEndAt: number) {
  return Math.max(0, Math.ceil((targetEndAt - Date.now()) / 1000));
}

function ensureNotificationHandler() {
  if (notificationHandlerConfigured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  notificationHandlerConfigured = true;
}

async function ensureNotificationChannel() {
  if (Platform.OS !== 'android' || notificationChannelConfigured) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Rest Timer',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
  notificationChannelConfigured = true;
}

async function ensureNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
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
  const [targetEndAt, setTargetEndAt] = useState<number | null>(null);

  const scheduledNotificationIdRef = useRef<string | null>(null);
  const completionSignaledRef = useRef(false);

  const isComplete = timeLeft === 0 && !isRunning;
  const styles = useMemo(
    () => createStyles(tokens, isComplete, isRunning, fabBottom, panelBottom),
    [tokens, isComplete, isRunning, fabBottom, panelBottom],
  );

  useEffect(() => {
    ensureNotificationHandler();
    void ensureNotificationChannel();
  }, []);

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
    if (!isRunning || targetEndAt == null) return;

    const syncRemaining = () => {
      const next = getRemainingSeconds(targetEndAt);
      setTimeLeft(next);
      if (next <= 0) {
        setIsRunning(false);
        setTargetEndAt(null);
      }
    };

    syncRemaining();
    const timer = setInterval(syncRemaining, 250);

    const appStateSubscription = AppState.addEventListener(
      'change',
      (state) => {
        if (state === 'active') {
          syncRemaining();
        }
      },
    );

    return () => {
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, [isRunning, targetEndAt]);

  useEffect(() => {
    if (timeLeft > 0 || isRunning || completionSignaledRef.current) {
      return;
    }

    completionSignaledRef.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [isRunning, timeLeft]);

  const progress = duration > 0 ? ((duration - timeLeft) / duration) * 100 : 0;

  const cancelScheduledAlert = async () => {
    if (!scheduledNotificationIdRef.current) return;
    try {
      await Notifications.cancelScheduledNotificationAsync(
        scheduledNotificationIdRef.current,
      );
    } catch {
      // ignore stale id failures
    } finally {
      scheduledNotificationIdRef.current = null;
    }
  };

  const scheduleFinishAlert = async (secondsUntilFinish: number) => {
    await cancelScheduledAlert();
    if (secondsUntilFinish <= 0) {
      return;
    }

    const granted = await ensureNotificationPermission();
    if (!granted) {
      return;
    }

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest complete',
        body: 'Back to your next set.',
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, secondsUntilFinish),
        channelId: CHANNEL_ID,
      },
    });

    scheduledNotificationIdRef.current = identifier;
  };

  const handleAdjustDuration = (delta: number) => {
    const next = Math.max(
      MIN_DURATION,
      Math.min(MAX_DURATION, duration + delta),
    );
    onDurationChange(next);
    if (!isRunning) {
      setTimeLeft(next);
      completionSignaledRef.current = false;
    }
  };

  const handleToggleRunning = () => {
    if (isRunning) {
      setIsRunning(false);
      setTargetEndAt(null);
      void cancelScheduledAlert();
      return;
    }

    const startFrom = timeLeft > 0 ? timeLeft : duration;
    if (startFrom <= 0) {
      return;
    }

    completionSignaledRef.current = false;
    setTimeLeft(startFrom);
    setTargetEndAt(Date.now() + startFrom * 1000);
    setIsRunning(true);
    void scheduleFinishAlert(startFrom);
  };

  const handleReset = () => {
    setTimeLeft(duration);
    setIsRunning(false);
    setTargetEndAt(null);
    completionSignaledRef.current = false;
    void cancelScheduledAlert();
  };

  if (!expanded) {
    return (
      <Pressable style={styles.fab} onPress={() => setExpanded(true)}>
        <MaterialIcons
          name="timer"
          size={24}
          color={
            isComplete
              ? tokens.colors.onSuccessContainer
              : tokens.colors.onPrimary
          }
        />
      </Pressable>
    );
  }

  return (
    <View pointerEvents="box-none" style={styles.panelContainer}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <MaterialIcons
              name="timer"
              size={18}
              color={tokens.colors.textPrimary}
            />
            <Text style={styles.label}>Rest Timer</Text>
          </View>
          <Pressable onPress={() => setExpanded(false)}>
            <MaterialIcons
              name="close"
              size={18}
              color={tokens.colors.textSecondary}
            />
          </Pressable>
        </View>

        <View style={styles.circleOuter}>
          <View style={styles.circleInner}>
            <Text style={styles.value}>{formatSeconds(timeLeft)}</Text>
            {isComplete && <Text style={styles.doneText}>REST COMPLETE!</Text>}
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        <View style={styles.controlRow}>
          <Pressable style={styles.iconButton} onPress={handleReset}>
            <MaterialIcons
              name="replay"
              size={18}
              color={tokens.colors.textPrimary}
            />
          </Pressable>
          <Pressable
            style={styles.playPauseButton}
            onPress={handleToggleRunning}
          >
            <MaterialIcons
              name={isRunning ? 'pause' : 'play-arrow'}
              size={30}
              color={
                isRunning
                  ? tokens.colors.accentWarning
                  : tokens.colors.onPrimary
              }
            />
          </Pressable>
          <Pressable
            style={[styles.iconButton, showSettings && styles.iconButtonActive]}
            onPress={() => setShowSettings((prev) => !prev)}
          >
            <MaterialIcons
              name="tune"
              size={18}
              color={
                showSettings ? tokens.colors.primary : tokens.colors.textPrimary
              }
            />
          </Pressable>
        </View>
        {showSettings && (
          <View style={styles.settingsPanel}>
            <Text style={styles.settingsLabel}>Adjust rest duration</Text>
            <View style={styles.settingsRow}>
              <Pressable
                style={styles.iconButton}
                onPress={() => handleAdjustDuration(-STEP)}
              >
                <MaterialIcons
                  name="remove"
                  size={18}
                  color={tokens.colors.textPrimary}
                />
              </Pressable>
              <Text style={styles.duration}>{formatSeconds(duration)}</Text>
              <Pressable
                style={styles.iconButton}
                onPress={() => handleAdjustDuration(STEP)}
              >
                <MaterialIcons
                  name="add"
                  size={18}
                  color={tokens.colors.textPrimary}
                />
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function createStyles(
  tokens: ThemeTokens,
  isComplete: boolean,
  isRunning: boolean,
  fabBottom: number,
  panelBottom: number,
) {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      left: 20,
      bottom: fabBottom,
      width: 54,
      height: 54,
      borderRadius: 16,
      backgroundColor: isComplete
        ? tokens.colors.success
        : withAlpha(tokens.colors.primary, 0.95),
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: tokens.colors.primary,
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    panelContainer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: panelBottom,
      alignItems: 'center',
      paddingHorizontal: 12,
    },
    panel: {
      width: '100%',
      maxWidth: 420,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: withAlpha(tokens.colors.surface, 0.98),
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    label: {
      color: tokens.colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    circleOuter: {
      width: 160,
      height: 160,
      borderRadius: 80,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(tokens.colors.primary, 0.18),
    },
    circleInner: {
      width: 138,
      height: 138,
      borderRadius: 69,
      backgroundColor: tokens.colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    value: {
      color: isComplete ? tokens.colors.success : tokens.colors.textPrimary,
      fontSize: 36,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    doneText: {
      color: tokens.colors.success,
      fontSize: 11,
      fontWeight: '700',
    },
    progressTrack: {
      height: 8,
      borderRadius: tokens.radius.pill,
      backgroundColor: withAlpha(tokens.colors.primary, 0.12),
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: isComplete
        ? tokens.colors.success
        : tokens.colors.primary,
      borderRadius: tokens.radius.pill,
    },
    controlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.md,
    },
    playPauseButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isRunning
        ? withAlpha(tokens.colors.accentWarning, 0.2)
        : tokens.colors.primary,
    },
    iconButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: withAlpha(tokens.colors.textPrimary, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButtonActive: {
      backgroundColor: withAlpha(tokens.colors.primary, 0.2),
    },
    settingsPanel: {
      paddingTop: tokens.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: tokens.colors.outlineVariant,
      gap: tokens.spacing.sm,
    },
    settingsLabel: {
      color: tokens.colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    settingsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.md,
    },
    duration: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '600',
    },
  });
}
