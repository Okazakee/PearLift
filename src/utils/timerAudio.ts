import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { AppState, Platform } from 'react-native';

import { COMPLETION_SOUND } from '../config/timer';

let completionSoundRef: Audio.Sound | null = null;

export async function prepareCompletionSound(): Promise<void> {
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

export async function playCompletionSound(): Promise<void> {
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

export function triggerCompletionFeedback(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  if (Platform.OS === 'web') {
    navigator.vibrate([200, 100, 200, 100, 200]);
  } else {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

export function safeDeactivateKeepAwake(tag: string): void {
  try {
    Promise.resolve(deactivateKeepAwake(tag)).catch(() => {
      // ignore if current activity is unavailable during shutdown/background transitions
    });
  } catch {
    // ignore sync throws from unavailable native activity
  }
}

export function safeActivateKeepAwake(tag: string): void {
  if (AppState.currentState !== 'active') {
    return;
  }
  try {
    Promise.resolve(activateKeepAwakeAsync(tag)).catch(() => {
      // ignore if current activity is unavailable during startup/background transitions
    });
  } catch {
    // ignore sync throws from unavailable native activity
  }
}
