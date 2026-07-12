import { spawn } from 'node:child_process';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ensureCommand,
  maestroArgs,
  maestroRoot,
  projectRoot,
  run,
  runCapture,
  runResult,
} from './common.mjs';
import {
  encodeSyncInvite,
  extractBootstrapKey,
  extractDiagnostics,
  extractPairingSecret,
} from './syncRunnerHelpers.mjs';

const DHT_BOOTSTRAP_PORT = 54973;

function startDhtBootstrap() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'node',
      ['./scripts/e2e/start-dht-bootstrap.mjs', String(DHT_BOOTSTRAP_PORT)],
      {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        child.kill();
        reject(new Error('DHT bootstrap startup timed out.'));
      }
    }, 10000);

    child.stdout.once('data', (chunk) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      const line = chunk.toString().trim();
      process.stdout.write(`${line}\n`);
      resolve(child);
    });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(new Error(`DHT bootstrap exited early with code ${code}.`));
      }
    });
  });
}

function stopDhtBootstrap(child) {
  try {
    child.kill('SIGTERM');
  } catch {
    // ignore
  }
}

function readLatestMaestroLog() {
  try {
    const testsRoot = resolve(homedir(), '.maestro/tests');
    const latestEntry = readdirSync(testsRoot, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        path: join(testsRoot, entry.name, 'maestro.log'),
        mtimeMs: statSync(join(testsRoot, entry.name)).mtimeMs,
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];

    if (!latestEntry) {
      return '';
    }

    return readFileSync(latestEntry.path, 'utf8');
  } catch {
    return '';
  }
}

function captureDiagnostics(device, label) {
  const result = runResult(
    'maestro',
    maestroArgs(device, '.maestro/flows/sync-copy-debug-payloads.yaml'),
  );
  const diagnostics =
    extractDiagnostics(result.combined) ??
    extractDiagnostics(readLatestMaestroLog());
  if (!diagnostics) {
    throw new Error(`Failed to capture sync diagnostics for ${label}.`);
  }
  if (result.status !== 0) {
    throw new Error(
      `Sync diagnostics flow failed for ${label} with exit code ${result.status}.`,
    );
  }

  const outDir = resolve(maestroRoot, 'out');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, `${label}-diagnostics.json`),
    JSON.stringify(diagnostics, null, 2),
    'utf8',
  );

  console.log(
    `SYNC_DIAGNOSTICS_${label.toUpperCase()}=${JSON.stringify(diagnostics)}`,
  );
  return diagnostics;
}

const deviceA = process.argv[2] ?? process.env.MAESTRO_DEVICE_A;
const deviceB = process.argv[3] ?? process.env.MAESTRO_DEVICE_B;
const addedExerciseName =
  process.env.SYNC_ADDED_EXERCISE_NAME ?? 'Synced Split Squat';
const renamedExerciseName =
  process.env.SYNC_RENAMED_EXERCISE_NAME ?? 'Bench Press Synced';
const syncedWeightValue = process.env.SYNC_EXPECTED_WEIGHT_VALUE ?? '91.5';
const creatorDeviceName =
  process.env.SYNC_CREATOR_DEVICE_NAME ?? 'E2E Creator Prime';
const joinerDeviceName =
  process.env.SYNC_JOINER_DEVICE_NAME ?? 'E2E Joiner Prime';

if (!deviceA || !deviceB) {
  throw new Error(
    'Missing emulator serials. Set MAESTRO_DEVICE_A and MAESTRO_DEVICE_B or pass both as arguments.',
  );
}

ensureCommand('maestro');

let dhtChild = null;
try {
  dhtChild = await startDhtBootstrap();

  const creatorOutput = runCapture(
    'maestro',
    maestroArgs(deviceA, '.maestro/flows/sync-create-capture.yaml'),
  );
  const creatorPairingSecret =
    extractPairingSecret(creatorOutput) ??
    extractPairingSecret(readLatestMaestroLog());
  const bootstrapKeyHex =
    extractBootstrapKey(creatorOutput) ??
    extractBootstrapKey(readLatestMaestroLog());

  if (!creatorPairingSecret) {
    throw new Error('Failed to capture creator pairing secret.');
  }
  if (!bootstrapKeyHex) {
    throw new Error('Failed to capture creator bootstrap key.');
  }

  run(
    'maestro',
    maestroArgs(deviceA, '.maestro/flows/sync-creator-assert.yaml'),
  );

  const syncInvite = encodeSyncInvite(creatorPairingSecret, bootstrapKeyHex);

  run('maestro', [
    '--device',
    deviceB,
    'test',
    '-e',
    `SYNC_JOIN_VALUE=${syncInvite}`,
    '.maestro/flows/sync-join.yaml',
  ]);

  const creatorAfterJoin = captureDiagnostics(deviceA, 'creator-after-join');
  const joinerAfterJoin = captureDiagnostics(deviceB, 'joiner-after-join');
  console.log(
    `SYNC_JOIN_DIAGNOSTICS=creator[${JSON.stringify(creatorAfterJoin)}] joiner[${JSON.stringify(joinerAfterJoin)}]`,
  );

  run('maestro', [
    '--device',
    deviceA,
    'test',
    '-e',
    `SYNC_DEVICE_NAME=${creatorDeviceName}`,
    '.maestro/flows/sync-rename-local-device.yaml',
  ]);
  run('maestro', [
    '--device',
    deviceB,
    'test',
    '-e',
    `SYNC_EXPECTED_PAIRED_DEVICE_NAME=${creatorDeviceName}`,
    '.maestro/flows/sync-assert-paired-device-name.yaml',
  ]);
  run('maestro', [
    '--device',
    deviceB,
    'test',
    '-e',
    `SYNC_DEVICE_NAME=${joinerDeviceName}`,
    '.maestro/flows/sync-rename-local-device.yaml',
  ]);
  run('maestro', [
    '--device',
    deviceA,
    'test',
    '-e',
    `SYNC_EXPECTED_PAIRED_DEVICE_NAME=${joinerDeviceName}`,
    '.maestro/flows/sync-assert-paired-device-name.yaml',
  ]);
  run('maestro', [
    '--device',
    deviceA,
    'test',
    '-e',
    `SYNC_ADDED_EXERCISE_NAME=${addedExerciseName}`,
    '-e',
    `SYNC_RENAMED_EXERCISE_NAME=${renamedExerciseName}`,
    '-e',
    `SYNC_EXPECTED_WEIGHT_VALUE=${syncedWeightValue}`,
    '.maestro/flows/sync-data-creator-mutate.yaml',
  ]);
  run('maestro', [
    '--device',
    deviceB,
    'test',
    '-e',
    `SYNC_ADDED_EXERCISE_NAME=${addedExerciseName}`,
    '-e',
    `SYNC_RENAMED_EXERCISE_NAME=${renamedExerciseName}`,
    '-e',
    `SYNC_EXPECTED_WEIGHT_VALUE=${syncedWeightValue}`,
    '.maestro/flows/sync-data-joiner-assert.yaml',
  ]);
  run(
    'maestro',
    maestroArgs(deviceA, '.maestro/flows/sync-data-creator-delete.yaml'),
  );
  run(
    'maestro',
    maestroArgs(deviceB, '.maestro/flows/sync-data-joiner-delete-assert.yaml'),
  );
} catch (error) {
  try {
    captureDiagnostics(deviceA, 'creator-failure');
  } catch {}
  try {
    captureDiagnostics(deviceB, 'joiner-failure');
  } catch {}
  throw error;
} finally {
  stopDhtBootstrap(dhtChild);
}
