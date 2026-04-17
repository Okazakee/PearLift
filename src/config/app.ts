import Constants from 'expo-constants';
import { Platform } from 'react-native';

const expoConfig = Constants.expoConfig;

const iosBuildNumber = expoConfig?.ios?.buildNumber;
const androidVersionCode = expoConfig?.android?.versionCode;

function resolveBuildNumber() {
  if (Platform.OS === 'ios' && typeof iosBuildNumber === 'string') {
    return iosBuildNumber;
  }
  if (
    Platform.OS === 'android' &&
    typeof androidVersionCode === 'number' &&
    Number.isFinite(androidVersionCode)
  ) {
    return String(androidVersionCode);
  }
  return null;
}

export const APP_CONFIG = {
  name: expoConfig?.name ?? 'PearLift',
  version: expoConfig?.version ?? '0.0.0',
  buildNumber: resolveBuildNumber(),
  buildType: __DEV__ ? 'Debug' : 'Release',
  githubRepoUrl: 'https://github.com/Okazakee/PearLift',
} as const;
