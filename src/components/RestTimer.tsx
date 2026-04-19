import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { RestTimerForegroundService } from '../native/restTimerForegroundService';
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

const KEEP_AWAKE_TAG = 'rest-timer';
const REST_TIMER_PERSIST_KEY = 'pearlift/rest_timer_v1';

type RestTimerMode = 'idle' | 'running' | 'paused' | 'complete';

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

function computeRemainingSeconds(endAtMs: number) {
  const diffMs = endAtMs - Date.now();
  return Math.max(0, Math.ceil(diffMs / 1000));
}

type PersistedRestTimerStateV1 = {
  v: 1;
  mode: RestTimerMode;
  endAtMs: number | null;
  remainingSec: number;
  startedDurationSec: number;
  scheduledNotificationId: string | null;
};

function safeParsePersistedState(
  raw: string | null,
): PersistedRestTimerStateV1 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedRestTimerStateV1>;
    if (parsed?.v !== 1) return null;
    if (
      parsed.mode !== 'idle' &&
      parsed.mode !== 'running' &&
      parsed.mode !== 'paused' &&
      parsed.mode !== 'complete'
    ) {
      return null;
    }
    if (
      typeof parsed.remainingSec !== 'number' ||
      !Number.isFinite(parsed.remainingSec)
    ) {
      return null;
    }
    if (
      typeof parsed.startedDurationSec !== 'number' ||
      !Number.isFinite(parsed.startedDurationSec)
    ) {
      return null;
    }
    const endAtMs =
      parsed.endAtMs === null ||
      (typeof parsed.endAtMs === 'number' && Number.isFinite(parsed.endAtMs))
        ? (parsed.endAtMs ?? null)
        : null;
    const scheduledNotificationId =
      parsed.scheduledNotificationId === null ||
      typeof parsed.scheduledNotificationId === 'string'
        ? (parsed.scheduledNotificationId ?? null)
        : null;

    return {
      v: 1,
      mode: parsed.mode,
      endAtMs,
      remainingSec: Math.max(0, Math.round(parsed.remainingSec)),
      startedDurationSec: Math.max(0, Math.round(parsed.startedDurationSec)),
      scheduledNotificationId,
    };
  } catch {
    return null;
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
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState<RestTimerMode>('idle');
  const [endAtMs, setEndAtMs] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState(duration);
  const [startedDurationSec, setStartedDurationSec] = useState(duration);
  const [scheduledNotificationId, setScheduledNotificationId] = useState<
    string | null
  >(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const endAtMsRef = useRef<number | null>(null);
  const scheduledIdRef = useRef<string | null>(null);
  const scheduleTokenRef = useRef(0);

  const isRunning = mode === 'running';
  const isComplete = mode === 'complete' && remainingSec === 0;

  const styles = useMemo(
    () => createStyles(tokens, isComplete, fabBottom, panelBottom),
    [tokens, isComplete, fabBottom, panelBottom],
  );

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    // Keep the "configured duration" and the "displayed remaining time" aligned when not running.
    // For paused timers, changes should reflect immediately like typical timer apps.
    if (mode === 'idle') {
      setRemainingSec(duration);
      setStartedDurationSec(duration);
      return;
    }
    if (mode === 'paused') {
      // If user adjusts duration while paused, mirror it as the remaining time baseline.
      // This matches the existing UX where adjusting duration updates the visible time when not running.
      setRemainingSec((current) => {
        if (current > duration) return duration;
        return current;
      });
      setStartedDurationSec((current) =>
        current < duration ? duration : current,
      );
      return;
    }
  }, [duration, mode]);

  useEffect(() => {
    endAtMsRef.current = endAtMs;
  }, [endAtMs]);

  useEffect(() => {
    scheduledIdRef.current = scheduledNotificationId;
  }, [scheduledNotificationId]);

  const clearIntervalIfAny = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const cancelScheduledNotificationIfAny = useCallback(async () => {
    const id = scheduledIdRef.current;
    if (!id) return;
    // Invalidate any in-flight schedule() calls.
    scheduleTokenRef.current += 1;
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // ignore
    } finally {
      scheduledIdRef.current = null;
      setScheduledNotificationId(null);
    }
  }, []);

  const scheduleCompletionNotification = useCallback(
    async (targetEndAtMs: number) => {
      // We always schedule a completion notification as a fallback.
      // On Android, if/when we hand off to the foreground service, we immediately cancel
      // the scheduled notification to avoid double alerts.
      const token = scheduleTokenRef.current;
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Rest complete',
            body: 'Time for your next set.',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(targetEndAtMs),
            channelId: Platform.OS === 'android' ? 'rest-timer' : undefined,
          },
        });
        if (scheduleTokenRef.current !== token) {
          // State changed (pause/reset/complete) while scheduling; cancel the stray notification.
          try {
            await Notifications.cancelScheduledNotificationAsync(id);
          } catch {
            // ignore
          }
          return;
        }
        scheduledIdRef.current = id;
        setScheduledNotificationId(id);
      } catch {
        // ignore scheduling failures (permissions denied/unavailable)
      }
    },
    [],
  );

  const completeInForeground = useCallback(async () => {
    clearIntervalIfAny();
    // Prevent late schedule() calls from reintroducing a notification id after completion.
    scheduleTokenRef.current += 1;
    await cancelScheduledNotificationIfAny();
    if (Platform.OS === 'android' && RestTimerForegroundService.isAvailable()) {
      await RestTimerForegroundService.cancel();
    }
    setEndAtMs(null);
    setRemainingSec(0);
    setMode('complete');
    void playCompletionSound();
    triggerCompletionFeedback();
  }, [cancelScheduledNotificationIfAny, clearIntervalIfAny]);

  const refreshRemainingFromEndAt = useCallback((targetEndAtMs: number) => {
    const nextRemaining = computeRemainingSeconds(targetEndAtMs);
    setRemainingSec((prev) => (prev === nextRemaining ? prev : nextRemaining));
    return nextRemaining;
  }, []);

  const startTicking = useCallback(() => {
    clearIntervalIfAny();
    const targetEndAtMs = endAtMsRef.current;
    if (!targetEndAtMs) return;
    intervalRef.current = setInterval(() => {
      const latestEnd = endAtMsRef.current;
      if (!latestEnd) return;
      const nextRemaining = computeRemainingSeconds(latestEnd);
      setRemainingSec((prev) =>
        prev === nextRemaining ? prev : nextRemaining,
      );
      if (nextRemaining <= 0) {
        // Only signal completion via in-app sound/haptics when the app is active.
        if (appStateRef.current === 'active') {
          void completeInForeground();
        } else {
          // The scheduled notification will handle background completion.
          clearIntervalIfAny();
        }
      }
    }, 250);
  }, [clearIntervalIfAny, completeInForeground]);

  useEffect(() => {
    // Restore persisted timer state on mount.
    let cancelled = false;
    AsyncStorage.getItem(REST_TIMER_PERSIST_KEY)
      .then((raw) => {
        if (cancelled) return;
        const persisted = safeParsePersistedState(raw);
        if (!persisted) return;

        if (
          persisted.mode === 'running' &&
          persisted.endAtMs &&
          persisted.endAtMs > Date.now()
        ) {
          setMode('running');
          setEndAtMs(persisted.endAtMs);
          setStartedDurationSec(persisted.startedDurationSec);
          setScheduledNotificationId(persisted.scheduledNotificationId);
          scheduledIdRef.current = persisted.scheduledNotificationId;
          endAtMsRef.current = persisted.endAtMs;
          setRemainingSec(computeRemainingSeconds(persisted.endAtMs));
          return;
        }

        if (
          persisted.mode === 'running' &&
          persisted.endAtMs &&
          persisted.endAtMs <= Date.now()
        ) {
          // Completed while app was backgrounded/killed; show completion without replaying feedback.
          setMode('complete');
          setEndAtMs(null);
          setScheduledNotificationId(null);
          scheduledIdRef.current = null;
          endAtMsRef.current = null;
          setStartedDurationSec(persisted.startedDurationSec);
          setRemainingSec(0);
          return;
        }

        setMode(persisted.mode);
        setEndAtMs(persisted.endAtMs);
        setRemainingSec(
          persisted.mode === 'complete'
            ? 0
            : Math.max(0, Math.min(MAX_DURATION, persisted.remainingSec)),
        );
        setStartedDurationSec(
          Math.max(0, Math.min(MAX_DURATION, persisted.startedDurationSec)),
        );
        setScheduledNotificationId(persisted.scheduledNotificationId);
        scheduledIdRef.current = persisted.scheduledNotificationId;
        endAtMsRef.current = persisted.endAtMs;
      })
      .catch(() => {
        // ignore restore failures
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Persist timer state, but avoid writing every tick while running.
    if (mode !== 'running') return;
    const payload: PersistedRestTimerStateV1 = {
      v: 1,
      mode,
      endAtMs,
      remainingSec: 0,
      startedDurationSec,
      scheduledNotificationId,
    };
    void AsyncStorage.setItem(REST_TIMER_PERSIST_KEY, JSON.stringify(payload));
  }, [mode, endAtMs, startedDurationSec, scheduledNotificationId]);

  useEffect(() => {
    if (mode === 'running') return;
    const payload: PersistedRestTimerStateV1 = {
      v: 1,
      mode,
      endAtMs: null,
      remainingSec,
      startedDurationSec,
      scheduledNotificationId: null,
    };
    void AsyncStorage.setItem(REST_TIMER_PERSIST_KEY, JSON.stringify(payload));
  }, [mode, remainingSec, startedDurationSec]);

  useEffect(() => {
    // Manage ticking lifecycle.
    if (mode === 'running' && endAtMs) {
      // Ensure remaining time is up to date immediately.
      const nowRemaining = refreshRemainingFromEndAt(endAtMs);
      if (nowRemaining <= 0) {
        // If we're active, complete immediately; otherwise just mark as complete on resume.
        if (appStateRef.current === 'active') {
          void completeInForeground();
        } else {
          setMode('complete');
          setEndAtMs(null);
          setRemainingSec(0);
        }
        return;
      }

      startTicking();
      return () => {
        clearIntervalIfAny();
      };
    }

    clearIntervalIfAny();
    return;
  }, [
    mode,
    endAtMs,
    clearIntervalIfAny,
    completeInForeground,
    refreshRemainingFromEndAt,
    startTicking,
  ]);

  useEffect(() => {
    // Stop background work and catch up precisely on resume.
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev === next) return;

      if (next !== 'active') {
        clearIntervalIfAny();
        const latestEnd = endAtMsRef.current;
        if (mode === 'running' && latestEnd) {
          if (
            Platform.OS === 'android' &&
            RestTimerForegroundService.isAvailable()
          ) {
            // Hand off to the foreground service while backgrounded.
            void cancelScheduledNotificationIfAny();
            void RestTimerForegroundService.start(
              latestEnd,
              startedDurationSec,
            );
          } else {
            // iOS/web fallback: rely on completion notifications only (no running notification).
          }
        }
        return;
      }

      if (
        Platform.OS === 'android' &&
        RestTimerForegroundService.isAvailable()
      ) {
        // Stop the foreground service to avoid a persistent notification in-app.
        void RestTimerForegroundService.stop();
        void RestTimerForegroundService.getState().then((state) => {
          if (!state) return;

          if (state.completedAtMs) {
            setMode('complete');
            setEndAtMs(null);
            setRemainingSec(0);
            void RestTimerForegroundService.clearCompletion();
            return;
          }

          if (
            state.mode === 'paused' &&
            typeof state.remainingSec === 'number'
          ) {
            setMode('paused');
            setEndAtMs(null);
            setRemainingSec(Math.max(0, Math.round(state.remainingSec)));
            return;
          }

          if (state.mode === 'idle') {
            // If the user stopped from the notification, reset.
            setMode('idle');
            setEndAtMs(null);
            setRemainingSec(duration);
            setStartedDurationSec(duration);
            return;
          }

          if (state.mode === 'running' && typeof state.endAtMs === 'number') {
            // If the service was still running, reconcile endAt.
            setMode('running');
            setEndAtMs(Math.round(state.endAtMs));
            return;
          }
        });
        return;
      }

      const latestEnd = endAtMsRef.current;
      if (mode === 'running' && latestEnd) {
        const nextRemaining = refreshRemainingFromEndAt(latestEnd);
        if (nextRemaining <= 0) {
          // Completed while backgrounded: show complete but don't replay feedback.
          void cancelScheduledNotificationIfAny();
          setMode('complete');
          setEndAtMs(null);
          setRemainingSec(0);
          return;
        }
        startTicking();
      }
    });
    return () => sub.remove();
    // mode intentionally included so we only restart ticking for running timers.
  }, [
    cancelScheduledNotificationIfAny,
    clearIntervalIfAny,
    duration,
    mode,
    refreshRemainingFromEndAt,
    startTicking,
    startedDurationSec,
  ]);

  useEffect(() => {
    if (isRunning) {
      try {
        void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      } catch {
        // ignore if activity unavailable
      }
    } else {
      try {
        void deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // ignore if activity unavailable
      }
    }

    return () => {
      try {
        void deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // ignore
      }
    };
  }, [isRunning]);

  const effectiveStarted =
    startedDurationSec > 0 ? startedDurationSec : duration;
  const progressPct =
    effectiveStarted > 0
      ? (Math.min(remainingSec, effectiveStarted) / effectiveStarted) * 100
      : 0;
  const progressClamped = Math.max(0, Math.min(100, progressPct));
  const ringSize = 140;
  const ringStroke = 7;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - progressClamped / 100);

  const handleToggleRunning = () => {
    if (mode === 'running') {
      // pause
      scheduleTokenRef.current += 1;
      const latestEnd = endAtMsRef.current;
      if (latestEnd) {
        setRemainingSec(computeRemainingSeconds(latestEnd));
      }
      setEndAtMs(null);
      setMode('paused');
      void cancelScheduledNotificationIfAny();
      return;
    }

    // start/resume
    if (mode === 'complete') {
      setRemainingSec(duration);
      setStartedDurationSec(duration);
    }
    const runRemaining = mode === 'complete' ? duration : remainingSec;
    const nextEnd = Date.now() + Math.max(0, runRemaining) * 1000;
    // Keep progress relative to the initial duration for this timer run.
    // Resuming from pause should not reset the baseline to 100%.
    if (mode !== 'paused') {
      setStartedDurationSec(runRemaining);
    } else if (startedDurationSec <= 0) {
      setStartedDurationSec(duration);
    }
    setEndAtMs(nextEnd);
    setMode('running');
    scheduleTokenRef.current += 1;
    void cancelScheduledNotificationIfAny().then(() =>
      scheduleCompletionNotification(nextEnd),
    );
  };

  const handleReset = () => {
    clearIntervalIfAny();
    scheduleTokenRef.current += 1;
    setMode('idle');
    setEndAtMs(null);
    setRemainingSec(duration);
    setStartedDurationSec(duration);
    void cancelScheduledNotificationIfAny();
    if (Platform.OS === 'android' && RestTimerForegroundService.isAvailable()) {
      void RestTimerForegroundService.cancel();
    }
  };

  const handleAdjustDuration = (delta: number) => {
    const newDuration = Math.max(
      MIN_DURATION,
      Math.min(MAX_DURATION, duration + delta),
    );
    onDurationChange(newDuration);
    if (mode !== 'running') {
      setRemainingSec(newDuration);
      setStartedDurationSec(newDuration);
      if (mode === 'complete') setMode('idle');
    }
  };

  if (!expanded) {
    return (
      <Pressable style={styles.fab} onPress={() => setExpanded(true)}>
        <MaterialCommunityIcons
          name="timer-outline"
          size={24}
          color={tokens.colors.onPrimary}
        />
      </Pressable>
    );
  }

  return (
    <View style={styles.panelContainer}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons
              name="timer-outline"
              size={18}
              color={tokens.colors.primary}
            />
            <Text style={styles.headerText}>Rest Timer</Text>
          </View>
          <Pressable
            style={styles.closeButton}
            onPress={() => setExpanded(false)}
          >
            <Feather name="x" size={16} color={tokens.colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.timerSection}>
          <View style={styles.circleOuter}>
            <Svg width={ringSize} height={ringSize} style={styles.circleSvg}>
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                stroke={withAlpha(tokens.colors.primary, 0.18)}
                strokeWidth={ringStroke}
                fill="none"
              />
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                stroke={
                  isComplete ? tokens.colors.success : tokens.colors.primary
                }
                strokeWidth={ringStroke}
                strokeLinecap="round"
                strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                strokeDashoffset={ringDashOffset}
                fill="none"
                rotation={-90}
                originX={ringSize / 2}
                originY={ringSize / 2}
              />
            </Svg>
            <View
              style={[styles.circleInner, isComplete && styles.circleComplete]}
            >
              <Text
                style={[
                  styles.timerText,
                  isComplete && styles.timerTextComplete,
                ]}
              >
                {formatSeconds(remainingSec)}
              </Text>
              {isComplete && (
                <Text style={styles.doneText}>REST COMPLETE!</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.controlRow}>
          <Pressable style={styles.controlButton} onPress={handleReset}>
            <Feather
              name="refresh-cw"
              size={20}
              color={tokens.colors.textPrimary}
            />
          </Pressable>
          <Pressable
            style={[styles.playButton, isRunning && styles.playButtonRunning]}
            onPress={handleToggleRunning}
          >
            {isRunning ? (
              <Feather
                name="pause"
                size={24}
                color={tokens.colors.accentWarning}
              />
            ) : (
              <MaterialCommunityIcons
                name="play"
                size={28}
                color={tokens.colors.onPrimary}
                style={styles.playIcon}
              />
            )}
          </Pressable>
          <Pressable
            style={[
              styles.controlButton,
              showSettings && styles.controlButtonActive,
            ]}
            onPress={() => setShowSettings(!showSettings)}
          >
            <Feather
              name="sliders"
              size={20}
              color={
                showSettings ? tokens.colors.primary : tokens.colors.textPrimary
              }
            />
          </Pressable>
        </View>

        {showSettings && (
          <View style={styles.settingsSection}>
            <View style={styles.durationRow}>
              <Text style={styles.settingsLabel}>Duration</Text>
              <View style={styles.durationControls}>
                <Pressable
                  style={[
                    styles.adjustButton,
                    duration <= MIN_DURATION && styles.adjustButtonDisabled,
                  ]}
                  onPress={() => handleAdjustDuration(-STEP)}
                  disabled={duration <= MIN_DURATION}
                >
                  <Feather
                    name="minus"
                    size={16}
                    color={tokens.colors.textPrimary}
                  />
                </Pressable>
                <Text style={styles.durationValue}>
                  {formatSeconds(duration)}
                </Text>
                <Pressable
                  style={[
                    styles.adjustButton,
                    duration >= MAX_DURATION && styles.adjustButtonDisabled,
                  ]}
                  onPress={() => handleAdjustDuration(STEP)}
                  disabled={duration >= MAX_DURATION}
                >
                  <Feather
                    name="plus"
                    size={16}
                    color={tokens.colors.textPrimary}
                  />
                </Pressable>
              </View>
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
      borderColor: tokens.colors.borderSubtle,
      backgroundColor: tokens.colors.surfaceContainer,
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
      gap: tokens.spacing.sm + 2,
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
      alignItems: 'center',
      justifyContent: 'center',
    },
    circleSvg: {
      position: 'absolute',
      left: 0,
      top: 0,
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
      fontFamily: 'SpaceGrotesk_700Bold',
    },
    timerTextComplete: {
      color: tokens.colors.success,
    },
    doneText: {
      color: tokens.colors.success,
      fontSize: 10,
      fontWeight: '700',
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
    playIcon: {
      marginLeft: 1,
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
    durationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.sm,
    },
    durationControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    adjustButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: withAlpha(tokens.colors.textPrimary, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    adjustButtonDisabled: {
      opacity: 0.45,
    },
    durationValue: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontFamily: 'SpaceGrotesk_700Bold',
      minWidth: 48,
      textAlign: 'center',
    },
  });
}
