import {
  apkPath,
  ensureCommand,
  ensureFile,
  getDevice,
  run,
} from './common.mjs';

const device = getDevice('MAESTRO_DEVICE_A');

ensureCommand('adb');
ensureFile(apkPath);
run('adb', ['-s', device, 'install', '-r', apkPath]);
