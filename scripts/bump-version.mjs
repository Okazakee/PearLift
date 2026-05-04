import { readFile, writeFile } from 'node:fs/promises';

function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }
  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number.parseInt(patch, 10) + 1}`;
}

const packageJsonPath = new URL('../package.json', import.meta.url);
const appJsonPath = new URL('../app.json', import.meta.url);
const fdroidVersionPath = new URL('../fdroid-version.txt', import.meta.url);

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const appJson = JSON.parse(await readFile(appJsonPath, 'utf8'));
const fdroidVersion = await readFile(fdroidVersionPath, 'utf8');

const currentVersion = appJson.expo?.version;
const currentVersionCode = appJson.expo?.android?.versionCode;

if (typeof currentVersion !== 'string') {
  throw new Error('app.json expo.version is missing or invalid');
}
if (!Number.isInteger(currentVersionCode)) {
  throw new Error('app.json expo.android.versionCode is missing or invalid');
}

const nextVersion = bumpPatch(currentVersion);
const nextVersionCode = currentVersionCode + 1;

packageJson.version = nextVersion;
appJson.expo.version = nextVersion;
appJson.expo.android.versionCode = nextVersionCode;

const nextFdroidVersion = fdroidVersion
  .replace(/^versionCode=\d+$/m, `versionCode=${nextVersionCode}`)
  .replace(/^versionName=.*$/m, `versionName=${nextVersion}`);

await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
await writeFile(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`, 'utf8');
await writeFile(fdroidVersionPath, nextFdroidVersion, 'utf8');

console.log(`Bumped version ${currentVersion} (${currentVersionCode}) -> ${nextVersion} (${nextVersionCode})`);
