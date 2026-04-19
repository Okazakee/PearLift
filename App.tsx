import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
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

let monospaceDefaultsApplied = false;

function applyMonospaceDefaults() {
  if (monospaceDefaultsApplied) return;
  const defaultFontFamily = 'SpaceGrotesk_400Regular';

  type TextLike = {
    defaultProps?: { style?: unknown };
  };

  const GlobalText = Text as unknown as TextLike;
  const GlobalTextInput = TextInput as unknown as TextLike;

  GlobalText.defaultProps = GlobalText.defaultProps ?? {};
  GlobalText.defaultProps.style = [
    { fontFamily: defaultFontFamily },
    GlobalText.defaultProps.style,
  ];

  GlobalTextInput.defaultProps = GlobalTextInput.defaultProps ?? {};
  GlobalTextInput.defaultProps.style = [
    { fontFamily: defaultFontFamily },
    GlobalTextInput.defaultProps.style,
  ];

  monospaceDefaultsApplied = true;
}

export default function App() {
  applyMonospaceDefaults();

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

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

  if (!fontsLoaded) {
    return <View />;
  }

  return (
    <SafeAreaProvider>
      <WorkoutScreen />
    </SafeAreaProvider>
  );
}
