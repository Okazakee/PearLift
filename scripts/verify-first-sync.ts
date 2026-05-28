import { spawnSync } from 'node:child_process';

const result = spawnSync('bun', ['test', 'tests/firstSync.test.ts'], {
  stdio: 'inherit',
});

if (typeof result.status === 'number' && result.status !== 0) {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}
