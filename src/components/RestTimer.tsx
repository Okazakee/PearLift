import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';

interface RestTimerProps {
  tokens: ThemeTokens;
  duration: number;
  onDurationChange: (value: number) => void;
  fabBottom: number;
  panelBottom: number;
}

const MIN_DURATION = 30;
const MAX_DURATION = 600;
const STEP = 15;

function formatSeconds(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function RestTimer({
  tokens,
  duration,
  onDurationChange,
  fabBottom,
  panelBottom,
}: RestTimerProps) {
  const [expanded, setExpanded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [timeLeft, setTimeLeft] = useState(duration);
  const isComplete = timeLeft === 0 && !isRunning;
  const styles = useMemo(
    () => createStyles(tokens, isComplete, isRunning, fabBottom, panelBottom),
    [tokens, isComplete, isRunning, fabBottom, panelBottom],
  );

  useEffect(() => {
    setTimeLeft(duration);
  }, [duration]);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning]);

  const progress = duration > 0 ? ((duration - timeLeft) / duration) * 100 : 0;

  const handleAdjustDuration = (delta: number) => {
    const next = Math.max(
      MIN_DURATION,
      Math.min(MAX_DURATION, duration + delta),
    );
    onDurationChange(next);
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
        <Pressable
          style={styles.iconButton}
          onPress={() => {
            setTimeLeft(duration);
            setIsRunning(false);
          }}
        >
          <MaterialIcons
            name="replay"
            size={18}
            color={tokens.colors.textPrimary}
          />
        </Pressable>
        <Pressable
          style={styles.playPauseButton}
          onPress={() => setIsRunning((prev) => !prev)}
        >
          <MaterialIcons
            name={isRunning ? 'pause' : 'play-arrow'}
            size={30}
            color={
              isRunning ? tokens.colors.accentWarning : tokens.colors.onPrimary
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
    panel: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: panelBottom,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: withAlpha(tokens.colors.surface, 0.98),
      padding: tokens.spacing.md,
      maxWidth: 400,
      alignSelf: 'center',
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
