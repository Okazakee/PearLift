import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(thisFile), '..');
const bundlePath = resolve(projectRoot, 'src/sync/sync.bundle.mjs');
const sourcePaths = [
  resolve(projectRoot, 'backend/sync-backend.mjs'),
  resolve(projectRoot, 'backend/sync-rpc-commands.mjs'),
];
const force = process.argv.includes('--force');

function newestSourceMtime() {
  return Math.max(...sourcePaths.map((path) => statSync(path).mtimeMs));
}

function needsBuild() {
  if (force) return true;
  if (!existsSync(bundlePath)) return true;
  return newestSourceMtime() > statSync(bundlePath).mtimeMs;
}

if (!needsBuild()) {
  process.exit(0);
}

console.log('[pearlift-sync] Building sync backend bundle...');

const result = spawnSync(
  resolve(projectRoot, 'node_modules/.bin/bare-pack'),
  [
    '--host',
    'android',
    '--linked',
    '--out',
    'src/sync/sync.bundle.mjs',
    'backend/sync-backend.mjs',
  ],
  {
    cwd: projectRoot,
    stdio: 'inherit',
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
