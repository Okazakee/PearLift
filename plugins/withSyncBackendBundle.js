const { withDangerousMod } = require('@expo/config-plugins');
const { execSync } = require('node:child_process');

let bundled = false;

function buildBundle(projectRoot) {
  if (bundled) return;
  bundled = true;
  console.log('[pearlift] Building sync backend bundle...');
  execSync(
    'node_modules/.bin/bare-pack --host ios --host android --linked --out src/sync/sync.bundle.mjs backend/sync-backend.mjs',
    { cwd: projectRoot, stdio: 'inherit' },
  );
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
module.exports = function withSyncBackendBundle(config) {
  for (const platform of ['android', 'ios']) {
    config = withDangerousMod(config, [
      platform,
      (c) => {
        buildBundle(c.modRequest.projectRoot);
        return c;
      },
    ]);
  }
  return config;
};
