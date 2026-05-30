import { apkPath, ensureFile, run } from './common.mjs';

run('node', ['./scripts/ensure-sync-backend-bundle.mjs', '--force']);
run('./scripts/build-android-apk.sh', [], {
  env: {
    EXPO_PUBLIC_PEARLIFT_E2E: '1',
    EXPO_PUBLIC_E2E_DHT_BOOTSTRAP_HOST:
      process.env.EXPO_PUBLIC_E2E_DHT_BOOTSTRAP_HOST ?? '10.0.2.2',
    EXPO_PUBLIC_E2E_DHT_BOOTSTRAP_PORT: '54973',
    PEARLIFT_RELEASE_ABIS:
      process.env.PEARLIFT_RELEASE_ABIS ?? 'x86_64,arm64-v8a',
  },
});
ensureFile(apkPath);
console.log(`E2E APK ready at ${apkPath}`);
