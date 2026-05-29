import { ensureCommand, getDevice, maestroArgs, run } from './common.mjs';

const device = getDevice('MAESTRO_DEVICE_A');
const flows = [
  '.maestro/flows/onboarding.yaml',
  '.maestro/flows/home-smoke.yaml',
  '.maestro/flows/settings-appearance.yaml',
  '.maestro/flows/settings-reset-prompt.yaml',
  '.maestro/flows/workout-crud.yaml',
  '.maestro/flows/program-settings.yaml',
  '.maestro/flows/rest-timer.yaml',
  '.maestro/flows/backup-qr-export.yaml',
  '.maestro/flows/sync-debug.yaml',
  '.maestro/flows/sync-rename-device.yaml',
];

ensureCommand('maestro');
for (const flow of flows) {
  run('maestro', maestroArgs(device, flow));
}
