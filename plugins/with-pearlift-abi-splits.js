// Local Expo config plugin: enable arm-only split APKs for F-Droid, while keeping
// Play Store AAB builds unchanged. This runs during `expo prebuild`.

const { withAppBuildGradle } = require('@expo/config-plugins');

const START = '// PEARLIFT_ABI_SPLITS_START';
const END = '// PEARLIFT_ABI_SPLITS_END';

function upsert(contents) {
  if (contents.includes(START) && contents.includes(END)) {
    // Already applied; keep it stable across repeated prebuilds.
    return contents;
  }

  const marker = 'android {';
  const idx = contents.indexOf(marker);
  if (idx === -1) return contents;

  const insertAt = idx + marker.length;
  const block =
    `\n` +
    `    ${START}\n` +
    `    dependenciesInfo {\n` +
    `        includeInApk false\n` +
    `        includeInBundle false\n` +
    `    }\n` +
    `\n` +
    `    // Opt-in via: -PpearliftAbiSplits=true\n` +
    `    def pearliftAbiSplits = (project.findProperty("pearliftAbiSplits") ?: "false").toString().toBoolean()\n` +
    `    if (pearliftAbiSplits) {\n` +
    `        splits {\n` +
    `            abi {\n` +
    `                enable true\n` +
    `                reset()\n` +
    `                include "armeabi-v7a", "arm64-v8a"\n` +
    `                universalApk false\n` +
    `            }\n` +
    `        }\n` +
    `\n` +
    `        // F-Droid expects distinct versionCodes per ABI output.\n` +
    `        // Scheme: baseVersionCode*100 + abiCode\n` +
    `        def abiCodes = ["armeabi-v7a": 1, "arm64-v8a": 2]\n` +
    `        applicationVariants.all { variant ->\n` +
    `            variant.outputs.each { output ->\n` +
    `                def abi = output.getFilter(com.android.build.OutputFile.ABI)\n` +
    `                if (abi != null && abiCodes.containsKey(abi)) {\n` +
    `                    output.versionCodeOverride = (defaultConfig.versionCode * 100) + abiCodes.get(abi)\n` +
    `                }\n` +
    `            }\n` +
    `        }\n` +
    `    }\n` +
    `    ${END}\n`;

  return contents.slice(0, insertAt) + block + contents.slice(insertAt);
}

module.exports = function withPearLiftAbiSplits(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') return config;
    config.modResults.contents = upsert(config.modResults.contents);
    return config;
  });
};
