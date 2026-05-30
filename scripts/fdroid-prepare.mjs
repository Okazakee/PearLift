import { execFile as execFileCallback } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const fdroidRepoDir =
  process.env.PEARLIFT_FDROIDDATA_DIR ??
  '/home/okazakee/Desktop/Projects/fdroiddata';
const metadataPath = path.join(
  fdroidRepoDir,
  'metadata',
  'dev.okazakee.pearlift.yml',
);

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
    throw new Error(
      'fdroid-version.txt is missing versionCode/versionName lines',
    );
  }

  return {
    versionCode: Number.parseInt(versionCodeMatch[1], 10),
    versionName: versionNameMatch[1].trim(),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceBuildForOutput(content, outputFile, build) {
  const blocks = content.match(
    /^ {2}- versionName:[\s\S]*?(?=\n\n {2}- versionName:|\n\nAutoUpdateMode:)/gm,
  );
  const buildBlock = blocks?.find((block) =>
    new RegExp(`^ {4}output: ${escapeRegExp(outputFile)}$`, 'm').test(block),
  );
  if (!buildBlock) {
    throw new Error(`Could not find ${build.abi} build in ${metadataPath}`);
  }

  const nextBuild = buildBlock
    .replace(
      /^ {2}- versionName: .*$/m,
      `  - versionName: ${build.versionName}`,
    )
    .replace(/^ {4}versionCode: \d+$/m, `    versionCode: ${build.versionCode}`)
    .replace(/^ {4}commit: [0-9a-f]{40}$/m, `    commit: ${build.commitSha}`);

  return content.replace(buildBlock, nextBuild);
}

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const appJson = JSON.parse(await readFile(appJsonPath, 'utf8'));
const fdroidVersion = parseFdroidVersionFile(
  await readFile(fdroidVersionPath, 'utf8'),
);
const metadata = await readFile(metadataPath, 'utf8');

const versionName = appJson.expo?.version;
const versionCode = appJson.expo?.android?.versionCode;

if (packageJson.version !== versionName) {
  throw new Error(
    `package.json version (${packageJson.version}) does not match app.json version (${versionName})`,
  );
}
if (!Number.isInteger(versionCode)) {
  throw new Error('app.json expo.android.versionCode is missing or invalid');
}
if (
  fdroidVersion.versionName !== versionName ||
  fdroidVersion.versionCode !== versionCode
) {
  throw new Error(
    `fdroid-version.txt (${fdroidVersion.versionName} / ${fdroidVersion.versionCode}) does not match app.json (${versionName} / ${versionCode})`,
  );
}

const { stdout: commitStdout } = await execFile('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
});
const commitSha = commitStdout.trim();
const fdroidBuilds = [
  {
    abi: 'arm64-v8a',
    outputFile:
      'android/app/build/outputs/apk/release/app-arm64-v8a-release.apk',
    versionCode: versionCode * 100 + 2,
    versionName,
    commitSha,
  },
];

let nextMetadata = metadata;

for (const build of fdroidBuilds) {
  nextMetadata = replaceBuildForOutput(nextMetadata, build.outputFile, build);
}

nextMetadata = replaceRequired(
  nextMetadata,
  /^CurrentVersion: .*$/m,
  `CurrentVersion: ${versionName}`,
  'CurrentVersion',
);
nextMetadata = replaceRequired(
  nextMetadata,
  /^CurrentVersionCode: \d+$/m,
  `CurrentVersionCode: ${fdroidBuilds.at(-1).versionCode}`,
  'CurrentVersionCode',
);

await writeFile(metadataPath, nextMetadata, 'utf8');

console.log(`Updated ${metadataPath}`);
console.log(`- versionName: ${versionName}`);
console.log(`- base versionCode: ${versionCode}`);
for (const build of fdroidBuilds) {
  console.log(`- ${build.abi} versionCode: ${build.versionCode}`);
}
console.log(`- commit: ${commitSha}`);
console.log('');
console.log('Next steps:');
console.log('1. Review app repo changes and commit them.');
console.log(`2. Create and push tag v${versionName}.`);
console.log('3. Review fdroiddata metadata changes.');
console.log('4. Commit and push the fdroiddata repo changes.');
