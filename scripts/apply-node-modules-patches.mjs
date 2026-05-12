import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const VISION_CAMERA_PATCH_ROOT = path.join(
  SCRIPT_DIR,
  'node-modules-patches/vision-camera-zxing',
);
const VISION_CAMERA_NODE_MODULE_ROOT = 'node_modules/vision-camera-zxing';

const VISION_CAMERA_PATCH_FILES = [
  'android/src/main/java/com/visioncamerazxing/VisionCameraZXingPackage.java',
  'android/src/main/java/com/visioncamerazxing/BitmapUtils.java',
  'android/src/main/java/com/visioncamerazxing/ZXingFrameProcessorPlugin.java',
  'src/index.tsx',
  'lib/commonjs/index.js',
  'lib/module/index.js',
  'lib/typescript/src/index.d.ts',
];

async function writeIfChanged(file, text) {
  let current = null;
  if (existsSync(file)) {
    current = await readFile(file, 'utf8');
  }

  if (current === text) return;
  await writeFile(file, text, 'utf8');
}

async function patchVisionCameraZxing() {
  for (const relativePath of VISION_CAMERA_PATCH_FILES) {
    const nodeModulesFile = path.join(
      VISION_CAMERA_NODE_MODULE_ROOT,
      relativePath,
    );
    if (!existsSync(nodeModulesFile)) continue;

    const patchFile = path.join(VISION_CAMERA_PATCH_ROOT, relativePath);
    if (!existsSync(patchFile)) continue;

    const patchText = await readFile(patchFile, 'utf8');
    await writeIfChanged(nodeModulesFile, patchText);
  }
}

async function patchHyperschemaRuntimeOptionalBuffer() {
  const cjsFiles = [
    'node_modules/hyperschema/runtime.cjs',
    'node_modules/autobase/node_modules/hyperschema/runtime.cjs',
  ];

  for (const file of cjsFiles) {
    if (!existsSync(file)) continue;

    const patched = `const c = require('compact-encoding');

if (!c.optionalBuffer) {
  // compact-encoding v2 encodes nullable buffers on c.buffer directly.
  c.optionalBuffer = c.buffer;
}

module.exports = {
  c,
};
`;
    await writeFile(file, patched, 'utf8');
  }

  const mjsFiles = [
    'node_modules/hyperschema/runtime.mjs',
    'node_modules/autobase/node_modules/hyperschema/runtime.mjs',
  ];

  for (const file of mjsFiles) {
    if (!existsSync(file)) continue;

    const patched = `import c from 'compact-encoding';

if (!c.optionalBuffer) {
  // compact-encoding v2 encodes nullable buffers on c.buffer directly.
  c.optionalBuffer = c.buffer;
}

export { c };
`;
    await writeFile(file, patched, 'utf8');
  }
}

await patchVisionCameraZxing();
await patchHyperschemaRuntimeOptionalBuffer();
