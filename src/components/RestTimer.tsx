import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sliders,
  Timer,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { MOTION } from '@/animation/motion';
import { E2E_IDS } from '@/config/testIds';
import {
  KEEP_AWAKE_TAG,
  MAX_DURATION,
  MIN_DURATION,
  REST_TIMER_PERSIST_KEY,
  RING_CIRCUMFERENCE,
  RING_RADIUS,
  RING_SIZE,
  RING_STROKE,
  STEP,
} from '@/config/timer';
import {
  cancelRestTimerNotification,
  scheduleRestTimerCompletionNotification,
} from '@/native/localNotifications';
import {
  RestTimerForegroundService,
  type RestTimerNotificationText,
} from '@/native/restTimerForegroundService';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import type { PersistedRestTimerStateV1, RestTimerMode } from '@/types/timer';
import {
  playCompletionSound,
  releaseCompletionSound,
  safeActivateKeepAwake,
  safeDeactivateKeepAwake,
  triggerCompletionFeedback,
} from '@/utils/timerAudio';
import {
  computeRemainingSeconds,
  formatSeconds,
  safeParsePersistedState,
} from '@/utils/timerHelpers';
import { Text } from './AppText';

interface RestTimerProps {
  tokens: ThemeTokens;
  duration: number;
  onDurationChange: (duration: number) => void;
  fabBottom: number;
  panelBottom: number;
  onExpandedChange?: (isOpen: boolean) => void;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function RestTimer({
  tokens,
  duration,
  onDurationChange,
  fabBottom,
  panelBottom,
  onExpandedChange,
}: RestTimerProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [panelContentMounted, setPanelContentMounted] = useState(false);
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
  const restoredFromNativeRef = useRef(false);
  const backgroundTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const scheduleTokenRef = useRef(0);
  const previousDurationRef = useRef(duration);
  const panelMountRafRef = useRef<number | null>(null);
  const panelUnmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const isRunning = mode === 'running';
  const isComplete = mode === 'complete' && remainingSec === 0;

  const styles = useMemo(
    () => createStyles(tokens, isComplete, fabBottom, panelBottom),
    [tokens, isComplete, fabBottom, panelBottom],
  );
  const nativeNotificationText = useMemo<RestTimerNotificationText>(
    () => ({
      runningTitle: t('restTimer.title'),
      runningPrefix: t('restTimer.notification.runningPrefix'),
      pausedPrefix: t('restTimer.notification.pausedPrefix'),
      completionTitle: t('restTimer.notification.title'),
      completionBody: t('restTimer.notification.body'),
      pauseActionLabel: t('restTimer.notification.actions.pause'),
      resumeActionLabel: t('restTimer.notification.actions.resume'),
      stopActionLabel: t('restTimer.notification.actions.stop'),
    }),
    [t],
  );

  const clearPanelContentSchedule = useCallback(() => {
    if (panelMountRafRef.current) {
      cancelAnimationFrame(panelMountRafRef.current);
      panelMountRafRef.current = null;
    }
    if (panelUnmountTimerRef.current) {
      clearTimeout(panelUnmountTimerRef.current);
      panelUnmountTimerRef.current = null;
    }
  }, []);

  const setExpandedState = useCallback(
    (nextExpanded: boolean) => {
      clearPanelContentSchedule();
      setExpanded(nextExpanded);
      onExpandedChange?.(nextExpanded);
      if (nextExpanded) {
        panelMountRafRef.current = requestAnimationFrame(() => {
          panelMountRafRef.current = null;
          setPanelContentMounted(true);
        });
        return;
      }

      panelUnmountTimerRef.current = setTimeout(() => {
        panelUnmountTimerRef.current = null;
        setPanelContentMounted(false);
      }, MOTION.duration.base);
    },
    [clearPanelContentSchedule, onExpandedChange],
  );

  const handleExpand = useCallback(() => {
    setExpandedState(true);
  }, [setExpandedState]);

  const handleCollapse = useCallback(() => {
    setExpandedState(false);
  }, [setExpandedState]);

  useEffect(() => {
    return () => {
      clearPanelContentSchedule();
      releaseCompletionSound();
    };
  }, [clearPanelContentSchedule]);

  useEffect(() => {
    const previousDuration = previousDurationRef.current;
    previousDurationRef.current = duration;

    // Keep the "configured duration" and the "displayed remaining time" aligned when not running.
    // For paused timers, changes should reflect immediately like typical timer apps.
    if (mode === 'idle') {
      setRemainingSec(duration);
      setStartedDurationSec(duration);
      return;
    }
    if (mode === 'paused' && duration !== previousDuration) {
      // Paused timers should reflect the new configured duration immediately.
      // This also resets the progress baseline for the next resume to match the edited value.
      setRemainingSec(duration);
      setStartedDurationSec(duration);
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
      await cancelRestTimerNotification(id);
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
        const id = await scheduleRestTimerCompletionNotification(
          t('restTimer.notification.title'),
          t('restTimer.notification.body'),
          targetEndAtMs,
        );
        if (scheduleTokenRef.current !== token) {
          // State changed (pause/reset/complete) while scheduling; cancel the stray notification.
          try {
            await cancelRestTimerNotification(id);
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
    [t],
  );

  const completeInForeground = useCallback(async () => {
    clearIntervalIfAny();
    // Prevent late schedule() calls from reintroducing a notification id after completion.
    scheduleTokenRef.current += 1;
    await cancelScheduledNotificationIfAny();
    if (RestTimerForegroundService.isAvailable()) {
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
    }, 1000);
  }, [clearIntervalIfAny, completeInForeground]);

  useEffect(() => {
    // Restore persisted timer state on mount.
    let cancelled = false;
    AsyncStorage.getItem(REST_TIMER_PERSIST_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (restoredFromNativeRef.current) return;
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
    if (!RestTimerForegroundService.isAvailable()) return;

    let cancelled = false;
    void (async () => {
      const state = await RestTimerForegroundService.getState();
      if (cancelled || !state) return;

      if (state.completedAtMs) {
        restoredFromNativeRef.current = true;
        setMode('complete');
        setEndAtMs(null);
        setRemainingSec(0);
        setScheduledNotificationId(null);
        scheduledIdRef.current = null;
        if (
          typeof state.startedDurationSec === 'number' &&
          state.startedDurationSec > 0
        ) {
          setStartedDurationSec(state.startedDurationSec);
        }
        void RestTimerForegroundService.clearCompletion();
      } else if (
        state.mode === 'paused' &&
        typeof state.remainingSec === 'number'
      ) {
        restoredFromNativeRef.current = true;
        setMode('paused');
        setEndAtMs(null);
        setRemainingSec(Math.max(0, Math.round(state.remainingSec)));
        setScheduledNotificationId(null);
        scheduledIdRef.current = null;
        if (
          typeof state.startedDurationSec === 'number' &&
          state.startedDurationSec > 0
        ) {
          setStartedDurationSec(state.startedDurationSec);
        }
      } else if (
        state.mode === 'running' &&
        typeof state.endAtMs === 'number'
      ) {
        restoredFromNativeRef.current = true;
        const reconciledEndAt = Math.round(state.endAtMs);
        if (reconciledEndAt <= Date.now()) {
          setMode('complete');
          setEndAtMs(null);
          setRemainingSec(0);
        } else {
          setMode('running');
          setEndAtMs(reconciledEndAt);
        }
        setScheduledNotificationId(null);
        scheduledIdRef.current = null;
        if (
          typeof state.startedDurationSec === 'number' &&
          state.startedDurationSec > 0
        ) {
          setStartedDurationSec(state.startedDurationSec);
        }
      }

      // Always try to hand off/stop to avoid orphaned notifications on startup.
      await RestTimerForegroundService.stop();
    })();

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
        // Cancel any still-pending handoff from a prior bounce.
        if (backgroundTimeoutRef.current) {
          clearTimeout(backgroundTimeoutRef.current);
          backgroundTimeoutRef.current = null;
        }
        const latestEnd = endAtMsRef.current;
        if (mode === 'running' && latestEnd) {
          if (RestTimerForegroundService.isAvailable()) {
            const handoffToForegroundService = () => {
              clearIntervalIfAny();
              const endAtNow = endAtMsRef.current;
              if (endAtNow) {
                void (async () => {
                  await cancelScheduledNotificationIfAny();
                  await RestTimerForegroundService.start(
                    endAtNow,
                    startedDurationSec,
                    nativeNotificationText,
                  );
                })();
              }
            };

            if (next === 'background') {
              // On a real background transition we must hand off immediately,
              // otherwise JS can be suspended before a delayed task runs.
              handoffToForegroundService();
            } else {
              // Delay handoff for transient non-active states to avoid churn
              // (notification shade, heads-up, etc.).
              backgroundTimeoutRef.current = setTimeout(() => {
                backgroundTimeoutRef.current = null;
                handoffToForegroundService();
              }, 600);
            }
          } else {
            clearIntervalIfAny();
          }
          return;
        }
        clearIntervalIfAny();
        return;
      }

      // Returned to active: cancel any pending handoff.
      if (backgroundTimeoutRef.current) {
        clearTimeout(backgroundTimeoutRef.current);
        backgroundTimeoutRef.current = null;
      }

      if (RestTimerForegroundService.isAvailable()) {
        void (async () => {
          // Read native state first. Stopping first can race with
          // notification actions (pause/resume/cancel) queued by the OS.
          const wait = (ms: number) =>
            new Promise<void>((resolve) => {
              setTimeout(resolve, ms);
            });

          let state = await RestTimerForegroundService.getState();
          if (!state) {
            await wait(90);
            state = await RestTimerForegroundService.getState();
          } else if (state.mode === 'running') {
            // Pause/cancel action from notification can race with foreground resume.
            // Give native state one short settle window before accepting "running".
            await wait(120);
            const settled = await RestTimerForegroundService.getState();
            if (settled) {
              state = settled;
            }
          }
          if (!state) return;

          if (state.completedAtMs) {
            setMode('complete');
            setEndAtMs(null);
            setRemainingSec(0);
            void RestTimerForegroundService.clearCompletion();
            await RestTimerForegroundService.stop().catch(() => {
              // ignore
            });
            return;
          }

          if (
            state.mode === 'paused' &&
            typeof state.remainingSec === 'number'
          ) {
            setMode('paused');
            setEndAtMs(null);
            setRemainingSec(Math.max(0, Math.round(state.remainingSec)));
            setScheduledNotificationId(null);
            scheduledIdRef.current = null;
            await RestTimerForegroundService.stop().catch(() => {
              // ignore
            });
            return;
          }

          if (state.mode === 'idle') {
            const knownEndAt = endAtMsRef.current;
            const fallbackRemaining = knownEndAt
              ? computeRemainingSeconds(knownEndAt)
              : 0;
            const shouldKeepPausedSnapshot =
              mode === 'running' && fallbackRemaining > 0;

            if (shouldKeepPausedSnapshot) {
              // Treat ambiguous idle as a recoverable handoff race and keep
              // a paused snapshot instead of resetting to full duration.
              setMode('paused');
              setEndAtMs(null);
              setRemainingSec(fallbackRemaining);
              if (!intervalRef.current) {
                clearIntervalIfAny();
              }
            } else {
              // Explicit stop/cancel path.
              setMode('idle');
              setEndAtMs(null);
              setRemainingSec(duration);
              setStartedDurationSec(duration);
            }
            setScheduledNotificationId(null);
            scheduledIdRef.current = null;
            await RestTimerForegroundService.stop().catch(() => {
              // ignore
            });
            return;
          }

          if (state.mode === 'running' && typeof state.endAtMs === 'number') {
            // If the service was still running, reconcile endAt.
            const reconciledEndAt = Math.round(state.endAtMs);
            endAtMsRef.current = reconciledEndAt;
            setMode('running');
            setEndAtMs(reconciledEndAt);
            setRemainingSec(computeRemainingSeconds(reconciledEndAt));
            setScheduledNotificationId(null);
            scheduledIdRef.current = null;
            startTicking();
            await RestTimerForegroundService.stop().catch(() => {
              // ignore
            });
            return;
          }
        })();
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
    return () => {
      sub.remove();
      if (backgroundTimeoutRef.current) {
        clearTimeout(backgroundTimeoutRef.current);
        backgroundTimeoutRef.current = null;
      }
    };
    // mode intentionally included so we only restart ticking for running timers.
  }, [
    cancelScheduledNotificationIfAny,
    clearIntervalIfAny,
    duration,
    mode,
    refreshRemainingFromEndAt,
    startTicking,
    startedDurationSec,
    nativeNotificationText,
  ]);

  // Defensive: restart ticking if the JS interval was lost for any reason
  // while the timer is still running (covers all edge cases).
  useEffect(() => {
    if (mode === 'running' && endAtMs && !intervalRef.current) {
      startTicking();
    }
  }, [mode, endAtMs, startTicking]);

  useEffect(() => {
    if (isRunning) {
      safeActivateKeepAwake(KEEP_AWAKE_TAG);
    } else {
      safeDeactivateKeepAwake(KEEP_AWAKE_TAG);
    }

    return () => {
      safeDeactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [isRunning]);

  const effectiveStarted =
    startedDurationSec > 0 ? startedDurationSec : duration;
  const ringOffsetAnimated = useSharedValue(
    RING_CIRCUMFERENCE *
      (1 -
        Math.max(0, Math.min(remainingSec, effectiveStarted)) /
          effectiveStarted),
  );

  const ringAnimation = useMemo(() => {
    if (mode === 'running' && endAtMs && effectiveStarted > 0) {
      const remainingMs = Math.max(0, endAtMs - Date.now());
      const currentProgress = Math.max(
        0,
        Math.min(remainingMs / (effectiveStarted * 1000), 1),
      );
      const startOffset = RING_CIRCUMFERENCE * (1 - currentProgress);
      return {
        initialOffset: startOffset,
        targetOffset: RING_CIRCUMFERENCE,
        duration: remainingMs,
        easing: Easing.linear,
      };
    }

    const clampedRemaining = Math.max(
      0,
      Math.min(remainingSec, effectiveStarted),
    );
    const targetOffset =
      RING_CIRCUMFERENCE * (1 - clampedRemaining / effectiveStarted);
    return {
      initialOffset: targetOffset,
      targetOffset,
      duration: 320,
      easing: Easing.inOut(Easing.cubic),
    };
  }, [effectiveStarted, endAtMs, mode, remainingSec]);

  useEffect(() => {
    cancelAnimation(ringOffsetAnimated);
    ringOffsetAnimated.value = ringAnimation.initialOffset;
    ringOffsetAnimated.value = withTiming(ringAnimation.targetOffset, {
      duration: ringAnimation.duration,
      easing: ringAnimation.easing,
      reduceMotion: ReduceMotion.System,
    });
  }, [ringAnimation, ringOffsetAnimated]);

  const ringAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: ringOffsetAnimated.value,
  }));
  const openProgress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    openProgress.value = withTiming(expanded ? 1 : 0, {
      duration: MOTION.duration.base,
      easing: MOTION.easing.standard,
      reduceMotion: ReduceMotion.System,
    });
  }, [expanded, openProgress]);

  const fabAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - openProgress.value,
    transform: [
      { scale: 1 - openProgress.value * 0.08 },
      { translateY: openProgress.value * 6 },
    ],
  }));

  const panelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: openProgress.value,
    transform: [
      { translateY: (1 - openProgress.value) * 12 },
      { scale: 0.98 + openProgress.value * 0.02 },
    ],
  }));

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
    cancelAnimation(ringOffsetAnimated);
    ringOffsetAnimated.value = 0;
    setMode('idle');
    setEndAtMs(null);
    setRemainingSec(duration);
    setStartedDurationSec(duration);
    void cancelScheduledNotificationIfAny();
    if (RestTimerForegroundService.isAvailable()) {
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

  return (
    <>
      <Animated.View
        pointerEvents={expanded ? 'none' : 'auto'}
        style={[styles.fabContainer, fabAnimatedStyle]}
      >
        <Pressable style={styles.fab} onPress={handleExpand}>
          <View collapsable={false} testID={E2E_IDS.restTimer.open}>
            <Timer size={24} color={tokens.colors.onPrimary} />
          </View>
        </Pressable>
      </Animated.View>

      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[styles.panelContainer, panelAnimatedStyle]}
      >
        <View style={styles.panel}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Timer size={18} color={tokens.colors.primary} />
              <Text style={styles.headerText}>{t('restTimer.title')}</Text>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={handleCollapse}
              hitSlop={10}
            >
              <View collapsable={false} testID={E2E_IDS.restTimer.close}>
                <X size={16} color={tokens.colors.textSecondary} />
              </View>
            </Pressable>
          </View>

          {panelContentMounted ? (
            <>
              <View style={styles.timerSection}>
                <View style={styles.circleOuter}>
                  <Svg
                    width={RING_SIZE}
                    height={RING_SIZE}
                    style={styles.circleSvg}
                  >
                    <Circle
                      cx={RING_SIZE / 2}
                      cy={RING_SIZE / 2}
                      r={RING_RADIUS}
                      stroke={withAlpha(tokens.colors.primary, 0.18)}
                      strokeWidth={RING_STROKE}
                      fill="none"
                    />
                    <AnimatedCircle
                      cx={RING_SIZE / 2}
                      cy={RING_SIZE / 2}
                      r={RING_RADIUS}
                      stroke={
                        isComplete
                          ? tokens.colors.success
                          : tokens.colors.primary
                      }
                      strokeWidth={RING_STROKE}
                      strokeLinecap="round"
                      strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                      animatedProps={ringAnimatedProps}
                      fill="none"
                      rotation={-90}
                      originX={RING_SIZE / 2}
                      originY={RING_SIZE / 2}
                    />
                  </Svg>
                  <View
                    style={[
                      styles.circleInner,
                      isComplete && styles.circleComplete,
                    ]}
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
                      <Text style={styles.doneText}>
                        {t('restTimer.complete')}
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.controlRow}>
                <Pressable style={styles.controlButton} onPress={handleReset}>
                  <View collapsable={false} testID={E2E_IDS.restTimer.reset}>
                    <RefreshCw size={20} color={tokens.colors.textPrimary} />
                  </View>
                </Pressable>
                <Pressable
                  style={[
                    styles.playButton,
                    isRunning && styles.playButtonRunning,
                  ]}
                  onPress={handleToggleRunning}
                >
                  <View
                    collapsable={false}
                    testID={E2E_IDS.restTimer.startPause}
                  >
                    {isRunning ? (
                      <Pause size={24} color={tokens.colors.accentWarning} />
                    ) : (
                      <Play
                        size={28}
                        color={tokens.colors.onPrimary}
                        style={styles.playIcon}
                      />
                    )}
                  </View>
                </Pressable>
                <Pressable
                  style={[
                    styles.controlButton,
                    showSettings && styles.controlButtonActive,
                  ]}
                  onPress={() => setShowSettings(!showSettings)}
                >
                  <View collapsable={false} testID={E2E_IDS.restTimer.settings}>
                    <Sliders
                      size={20}
                      color={
                        showSettings
                          ? tokens.colors.primary
                          : tokens.colors.textPrimary
                      }
                    />
                  </View>
                </Pressable>
              </View>

              {showSettings ? (
                <Animated.View
                  style={styles.settingsSection}
                  layout={LinearTransition.reduceMotion(ReduceMotion.System)}
                  entering={FadeIn.duration(MOTION.duration.base).reduceMotion(
                    ReduceMotion.System,
                  )}
                  exiting={FadeOut.duration(MOTION.duration.fast).reduceMotion(
                    ReduceMotion.System,
                  )}
                >
                  <View style={styles.durationRow}>
                    <Text style={styles.settingsLabel}>
                      {t('restTimer.duration')}
                    </Text>
                    <View style={styles.durationControls}>
                      <Pressable
                        style={[
                          styles.adjustButton,
                          duration <= MIN_DURATION &&
                            styles.adjustButtonDisabled,
                        ]}
                        onPress={() => handleAdjustDuration(-STEP)}
                        disabled={duration <= MIN_DURATION}
                      >
                        <View
                          collapsable={false}
                          testID={E2E_IDS.restTimer.decrementDuration}
                        >
                          <Minus size={16} color={tokens.colors.textPrimary} />
                        </View>
                      </Pressable>
                      <Text style={styles.durationValue}>
                        {formatSeconds(duration)}
                      </Text>
                      <Pressable
                        style={[
                          styles.adjustButton,
                          duration >= MAX_DURATION &&
                            styles.adjustButtonDisabled,
                        ]}
                        onPress={() => handleAdjustDuration(STEP)}
                        disabled={duration >= MAX_DURATION}
                      >
                        <View
                          collapsable={false}
                          testID={E2E_IDS.restTimer.incrementDuration}
                        >
                          <Plus size={16} color={tokens.colors.textPrimary} />
                        </View>
                      </Pressable>
                    </View>
                  </View>
                </Animated.View>
              ) : null}
            </>
          ) : (
            <View style={styles.panelWarmup} />
          )}
        </View>
      </Animated.View>
    </>
  );
}

function createStyles(
  tokens: ThemeTokens,
  isComplete: boolean,
  fabBottom: number,
  panelBottom: number,
) {
  return StyleSheet.create({
    fabContainer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
    },
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
    panelWarmup: {
      height: 220,
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
      width: 36,
      height: 36,
      borderRadius: 18,
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
