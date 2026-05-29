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
  run,
  runCapture,
  runResult,
} from './common.mjs';

function extractPairingSecret(text) {
  const match = text.match(/SYNC_PAIRING_SECRET=([0-9a-f]{64})/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function extractBootstrapKey(text) {
  const match = text.match(/SYNC_BOOTSTRAP_KEY=([0-9a-f]{64})/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function encodeSyncInvite(pairingSecretHex, bootstrapKeyHex) {
  const payload = JSON.stringify({
    pairingSecretHex,
    bootstrapKeyHex,
  });

  return `pearlift-sync-room:v1:${Buffer.from(payload, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '')}`;
}

function readLatestMaestroLog() {
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
}

function extractDiagnostics(text) {
  const match = text.match(
    /\{"type":"SYNC_DIAGNOSTICS","snapshot":"[\s\S]*?","logs":"[\s\S]*?"\}/g,
  );
  if (!match?.length) {
    return null;
  }

  const raw = match[match.length - 1];
  try {
    return JSON.parse(raw);
  } catch {
    return null;
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

const creatorOutput = runCapture(
  'maestro',
  maestroArgs(deviceA, '.maestro/flows/sync-create-capture.yaml'),
);

try {
  run(
    'maestro',
    maestroArgs(deviceA, '.maestro/flows/sync-creator-assert.yaml'),
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
}
