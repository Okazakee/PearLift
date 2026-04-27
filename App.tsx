import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Platform, Text, TextInput } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BootstrapScreen } from './src/components/BootstrapScreen';
import { APP_CONFIG } from './src/config/app';
import i18n from './src/i18n';
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
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  if (fontsLoaded) {
    applyMonospaceDefaults();
  }

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const syncRestTimerChannels = () => {
      // Channel ids are immutable once created, but Android allows channel metadata like
      // the display name to be updated by recreating the channel with the same id.
      Notifications.setNotificationChannelAsync('rest-timer', {
        name: i18n.t('restTimer.notification.channelName'),
        importance: Notifications.AndroidImportance.MAX,
        enableVibrate: true,
        vibrationPattern: [0, 250, 150, 250],
        showBadge: false,
      }).catch(() => {
        // ignore channel creation failures
      });

      Notifications.setNotificationChannelAsync('rest-timer-v2', {
        name: i18n.t('restTimer.notification.channelName'),
        importance: Notifications.AndroidImportance.MAX,
        enableVibrate: true,
        vibrationPattern: [0, 250, 150, 250],
        showBadge: false,
        audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM },
      }).catch(() => {
        // ignore channel creation failures
      });
    };

    syncRestTimerChannels();
    i18n.on('languageChanged', syncRestTimerChannels);

    return () => {
      i18n.off('languageChanged', syncRestTimerChannels);
    };
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          {!fontsLoaded ? (
            <BootstrapScreen
              backgroundColor="#111113"
              accentColor="#3dd68c"
              imageSource={require('./assets/pearlift_transparent.png')}
              title={APP_CONFIG.name}
              subtitle={i18n.t('app.loading')}
              textPrimary="#ffffff"
              textSecondary="rgba(255,255,255,0.72)"
            />
          ) : (
            <WorkoutScreen />
          )}
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </I18nextProvider>
  );
}
