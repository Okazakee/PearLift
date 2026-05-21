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
const nestedParent = resolve(projectRoot, 'node_modules/expo/node_modules');
const dedupedExpoModules = ['expo-file-system', 'expo-font', 'expo-keep-awake'];

// Some Expo packages are bundled inside node_modules/expo/node_modules/.
// Link them back to the root copy so expo-doctor doesn't see duplicates.
for (const moduleName of dedupedExpoModules) {
  const rootModule = resolve(projectRoot, 'node_modules', moduleName);
  const nestedModule = resolve(nestedParent, moduleName);
  const relativeTarget = `../../${moduleName}`;

  if (!existsSync(rootModule) || !existsSync(nestedParent)) continue;

  mkdirSync(nestedParent, { recursive: true });

  if (existsSync(nestedModule)) {
    const stats = lstatSync(nestedModule);
    if (
      stats.isSymbolicLink() &&
      readlinkSync(nestedModule) === relativeTarget
    ) {
      // already correct, skip
    } else {
      rmSync(nestedModule, { recursive: true, force: true });
      symlinkSync(relativeTarget, nestedModule);
      console.log(
        `[postinstall] Linked expo/node_modules/${moduleName} -> ${relativeTarget}`,
      );
    }
  } else {
    symlinkSync(relativeTarget, nestedModule);
    console.log(
      `[postinstall] Linked expo/node_modules/${moduleName} -> ${relativeTarget}`,
    );
  }
}

// Link local native modules from modules/ into node_modules/ so Metro can resolve
// them. No file: dependency in package.json — just a symlink that expo autolinking
// and Metro both understand as a single package.
const nativeModuleDirs = ['pearlift-rest-timer-fgs'];

for (const name of nativeModuleDirs) {
  const linkPath = resolve(projectRoot, 'node_modules', name);
  const targetPath = resolve(projectRoot, 'modules', name);

  if (!existsSync(targetPath)) continue;

  if (existsSync(linkPath)) {
    const stats = lstatSync(linkPath);
    if (
      stats.isSymbolicLink() &&
      readlinkSync(linkPath) === `../modules/${name}`
    ) {
      continue;
    }
    rmSync(linkPath, { recursive: true, force: true });
  }

  symlinkSync(`../modules/${name}`, linkPath);
  console.log(`[postinstall] Linked node_modules/${name} -> modules/${name}`);
}
