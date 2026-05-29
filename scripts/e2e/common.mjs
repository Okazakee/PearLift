import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);

export const projectRoot = resolve(dirname(thisFile), '../..');
export const maestroRoot = resolve(projectRoot, '.maestro');
export const apkPath = resolve(
  projectRoot,
  'android/app/build/outputs/apk/release/app-release.apk',
);

export function getDevice(envName, fallbackArgIndex = 2) {
  const fromArg = process.argv[fallbackArgIndex];
  if (fromArg) return fromArg;
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;
  throw new Error(
    `Missing device serial. Set ${envName} or pass it as an argument.`,
  );
}

export function ensureCommand(command) {
  const result = spawnSync('which', [command], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Required command not found on PATH: ${command}`);
  }
}

export function ensureFile(path) {
  if (!existsSync(path)) {
    throw new Error(`Required file not found: ${path}`);
  }
}

export function run(command, args, options = {}) {
  const printable = [command, ...args].join(' ');
  console.log(`+ ${printable}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...options.env,
    },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function runCapture(command, args, options = {}) {
  const printable = [command, ...args].join(' ');
  console.log(`+ ${printable}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...options.env,
    },
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const combined = stdout + (stderr ? `\n${stderr}` : '');
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return combined;
}

export function runResult(command, args, options = {}) {
  const printable = [command, ...args].join(' ');
  console.log(`+ ${printable}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...options.env,
    },
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  process.stdout.write(stdout);
  process.stderr.write(stderr);

  return {
    status: result.status ?? 1,
    stdout,
    stderr,
    combined: stdout + (stderr ? `\n${stderr}` : ''),
  };
}

export function maestroArgs(device, flowPath, extraArgs = []) {
  return ['--device', device, 'test', ...extraArgs, flowPath];
}
