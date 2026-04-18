import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WorkoutScreen } from './src/screens/WorkoutScreen';

// While the app is foregrounded, the rest timer uses in-app sound/haptics.
// Suppress OS banners/lists so users don't get double alerts.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
} catch {
  // ignore if notifications unavailable on a given platform/runtime (e.g. web)
}

export default function App() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Ensure a dedicated channel exists so the rest timer completion notification is timely and visible.
    Notifications.setNotificationChannelAsync('rest-timer', {
      name: 'Rest timer',
      importance: Notifications.AndroidImportance.MAX,
      enableVibrate: true,
      vibrationPattern: [0, 250, 150, 250],
      showBadge: false,
    }).catch(() => {
      // ignore channel creation failures
    });
  }, []);

  return (
    <SafeAreaProvider>
      <WorkoutScreen />
    </SafeAreaProvider>
  );
}
