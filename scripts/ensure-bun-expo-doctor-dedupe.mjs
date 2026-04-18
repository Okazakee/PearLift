import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(thisFile), '..');
const rootModule = resolve(projectRoot, 'node_modules/expo-file-system');
const nestedModule = resolve(
  projectRoot,
  'node_modules/expo/node_modules/expo-file-system',
);
const nestedParent = resolve(projectRoot, 'node_modules/expo/node_modules');
const relativeTarget = '../../expo-file-system';

if (!existsSync(rootModule) || !existsSync(nestedParent)) {
  process.exit(0);
}

mkdirSync(nestedParent, { recursive: true });

if (existsSync(nestedModule)) {
  const stats = lstatSync(nestedModule);
  if (stats.isSymbolicLink()) {
    const currentTarget = readlinkSync(nestedModule);
    if (currentTarget === relativeTarget) {
      process.exit(0);
    }
  }
  rmSync(nestedModule, { recursive: true, force: true });
}

symlinkSync(relativeTarget, nestedModule);
console.log(
  '[postinstall] Linked expo/node_modules/expo-file-system -> ../../expo-file-system',
);
