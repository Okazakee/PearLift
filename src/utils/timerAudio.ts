import {
  type AudioPlayer,
  createAudioPlayer,
  setAudioModeAsync,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { AppState } from 'react-native';

import { COMPLETION_SOUND } from '@/config/timer';

let completionSoundRef: AudioPlayer | null = null;

export async function prepareCompletionSound(): Promise<void> {
  if (completionSoundRef) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
    completionSoundRef = createAudioPlayer(
      { uri: COMPLETION_SOUND },
      { keepAudioSessionActive: false },
    );
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
    await completionSoundRef.seekTo(0);
    completionSoundRef.play();
  } catch {
    // ignore playback failures
  }
}

export function releaseCompletionSound(): void {
  if (!completionSoundRef) return;
  try {
    completionSoundRef.remove();
  } catch {
    // ignore audio player release failures during shutdown
  }
  completionSoundRef = null;
}

export function triggerCompletionFeedback(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function safeDeactivateKeepAwake(tag: string): void {
  try {
    deactivateKeepAwake(tag);
  } catch {
    // ignore unavailable activity during shutdown/background transitions
  }
}

export function safeActivateKeepAwake(tag: string): void {
  if (AppState.currentState !== 'active') return;
  try {
    activateKeepAwakeAsync(tag).catch(() => {
      // ignore unavailable activity during startup/background transitions
    });
  } catch {
    // ignore sync throws from unavailable native activity
  }
}
