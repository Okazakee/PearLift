import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const fdroidRepoDir = process.env.PEARLIFT_FDROIDDATA_DIR ?? '/home/okazakee/Desktop/Projects/fdroiddata';
const metadataPath = path.join(fdroidRepoDir, 'metadata', 'dev.okazakee.pearlift.yml');

const packageJsonPath = path.join(repoRoot, 'package.json');
const appJsonPath = path.join(repoRoot, 'app.json');
const fdroidVersionPath = path.join(repoRoot, 'fdroid-version.txt');

function replaceRequired(content, pattern, replacer, label) {
  if (!pattern.test(content)) {
    throw new Error(`Could not find ${label} in ${metadataPath}`);
  }
  return content.replace(pattern, replacer);
}

function parseFdroidVersionFile(content) {
  const versionCodeMatch = content.match(/^versionCode=(\d+)$/m);
  const versionNameMatch = content.match(/^versionName=(.+)$/m);

  if (!versionCodeMatch || !versionNameMatch) {
    throw new Error('fdroid-version.txt is missing versionCode/versionName lines');
  }

  return {
    versionCode: Number.parseInt(versionCodeMatch[1], 10),
    versionName: versionNameMatch[1].trim(),
  };
}

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const appJson = JSON.parse(await readFile(appJsonPath, 'utf8'));
const fdroidVersion = parseFdroidVersionFile(await readFile(fdroidVersionPath, 'utf8'));
const metadata = await readFile(metadataPath, 'utf8');

const versionName = appJson.expo?.version;
const versionCode = appJson.expo?.android?.versionCode;

if (packageJson.version !== versionName) {
  throw new Error(`package.json version (${packageJson.version}) does not match app.json version (${versionName})`);
}
if (!Number.isInteger(versionCode)) {
  throw new Error('app.json expo.android.versionCode is missing or invalid');
}
if (fdroidVersion.versionName !== versionName || fdroidVersion.versionCode !== versionCode) {
  throw new Error(
    `fdroid-version.txt (${fdroidVersion.versionName} / ${fdroidVersion.versionCode}) does not match app.json (${versionName} / ${versionCode})`,
  );
}

const { stdout: commitStdout } = await execFile('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
const commitSha = commitStdout.trim();

let nextMetadata = metadata;
nextMetadata = replaceRequired(
  nextMetadata,
  /^  - versionName: .*$/m,
  `  - versionName: ${versionName}`,
  'Builds[0].versionName',
);
nextMetadata = replaceRequired(
  nextMetadata,
  /^    versionCode: \d+$/m,
  `    versionCode: ${versionCode}`,
  'Builds[0].versionCode',
);
nextMetadata = replaceRequired(
  nextMetadata,
  /^    commit: [0-9a-f]{40}$/m,
  `    commit: ${commitSha}`,
  'Builds[0].commit',
);
nextMetadata = replaceRequired(
  nextMetadata,
  /^CurrentVersion: .*$/m,
  `CurrentVersion: ${versionName}`,
  'CurrentVersion',
);
nextMetadata = replaceRequired(
  nextMetadata,
  /^CurrentVersionCode: \d+$/m,
  `CurrentVersionCode: ${versionCode}`,
  'CurrentVersionCode',
);

await writeFile(metadataPath, nextMetadata, 'utf8');

console.log(`Updated ${metadataPath}`);
console.log(`- versionName: ${versionName}`);
console.log(`- versionCode: ${versionCode}`);
console.log(`- commit: ${commitSha}`);
console.log('');
console.log('Next steps:');
console.log('1. Review app repo changes and commit them.');
console.log(`2. Create and push tag v${versionName}.`);
console.log('3. Review fdroiddata metadata changes.');
console.log('4. Commit and push the fdroiddata repo changes.');
