import Constants from 'expo-constants';

const expoConfig = Constants.expoConfig;

const androidVersionCode = expoConfig?.android?.versionCode;

function resolveBuildNumber() {
  if (
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
