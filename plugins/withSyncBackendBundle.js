const { withDangerousMod } = require('@expo/config-plugins');
const { execSync } = require('node:child_process');

let bundled = false;

function buildBundle(projectRoot) {
  if (bundled) return;
  bundled = true;
  execSync('node ./scripts/ensure-sync-backend-bundle.mjs --force', {
    cwd: projectRoot,
    stdio: 'inherit',
  });
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
