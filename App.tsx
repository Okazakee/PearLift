import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WorkoutScreen } from './src/screens/WorkoutScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <WorkoutScreen />
    </SafeAreaProvider>
  );
}
