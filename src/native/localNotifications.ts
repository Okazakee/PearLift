import { Platform } from 'react-native';
import notifee, {
  AlarmType,
  AndroidImportance,
  type TimestampTrigger,
  TriggerType,
} from 'react-native-notify-kit';

const DEFAULT_PRESS_ACTION_ID = 'default';

export async function requestNotificationPermission() {
  return await notifee.requestPermission();
}

export async function ensureRestTimerChannels(channelName: string) {
  if (Platform.OS !== 'android') return;

  await Promise.all([
    notifee.createChannel({
      id: 'rest-timer',
      name: channelName,
      importance: AndroidImportance.HIGH,
      vibration: true,
      vibrationPattern: [0, 250, 150, 250],
      badge: false,
    }),
    notifee.createChannel({
      id: 'rest-timer-v2',
      name: channelName,
      importance: AndroidImportance.HIGH,
      vibration: true,
      vibrationPattern: [0, 250, 150, 250],
      badge: false,
    }),
  ]);
}

export async function scheduleRestTimerCompletionNotification(
  title: string,
  body: string,
  timestamp: number,
) {
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp,
    alarmManager:
      Platform.OS === 'android'
        ? { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE }
        : undefined,
  };

  return await notifee.createTriggerNotification(
    {
      title,
      body,
      android:
        Platform.OS === 'android'
          ? {
              channelId: 'rest-timer-v2',
              pressAction: { id: DEFAULT_PRESS_ACTION_ID },
            }
          : undefined,
    },
    trigger,
  );
}

export async function cancelRestTimerNotification(notificationId: string) {
  await notifee.cancelNotification(notificationId);
}
