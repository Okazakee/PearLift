import { apkPath, ensureFile, run } from './common.mjs';

run('node', ['./scripts/ensure-sync-backend-bundle.mjs', '--force']);
run('./scripts/build-android-apk.sh', [], {
  env: {
    EXPO_PUBLIC_PEARLIFT_E2E: '1',
    PEARLIFT_RELEASE_ABIS: 'x86_64',
  },
});
ensureFile(apkPath);
console.log(`E2E APK ready at ${apkPath}`);
