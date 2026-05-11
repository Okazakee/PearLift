const { withAppBuildGradle } = require('@expo/config-plugins');

const START = '// PEARLIFT_OPTIONAL_RELEASE_SIGNING_START';
const END = '// PEARLIFT_OPTIONAL_RELEASE_SIGNING_END';

function upsertImport(contents) {
  if (contents.includes('import java.util.Properties')) {
    return contents;
  }

  const firstApply = 'apply plugin: "com.android.application"';
  const idx = contents.indexOf(firstApply);
  if (idx === -1) return contents;
  return `${contents.slice(0, idx)}import java.util.Properties\n\n${contents.slice(idx)}`;
}

function upsertSigningProps(contents) {
  if (contents.includes(START) && contents.includes(END)) {
    return contents;
  }

  const marker =
    "def enableMinifyInReleaseBuilds = (findProperty('android.enableMinifyInReleaseBuilds') ?: false).toBoolean()";
  const idx = contents.indexOf(marker);
  if (idx === -1) return contents;

  const insertAt = idx + marker.length;
  const block =
    `\n\n${START}\n` +
    `def keystoreProperties = new Properties()\n` +
    `def keystorePropertiesFile = rootProject.file('keystore.properties')\n` +
    `if (keystorePropertiesFile.exists()) {\n` +
    `    keystorePropertiesFile.withInputStream { stream ->\n` +
    `        keystoreProperties.load(stream)\n` +
    `    }\n` +
    `}\n` +
    `def releaseStoreFile = keystoreProperties.getProperty('storeFile')\n` +
    `def releaseStorePassword = keystoreProperties.getProperty('storePassword')\n` +
    `def releaseKeyAlias = keystoreProperties.getProperty('keyAlias')\n` +
    `def releaseKeyPassword = keystoreProperties.getProperty('keyPassword')\n` +
    `def hasReleaseSigning = releaseStoreFile && releaseStorePassword && releaseKeyAlias && releaseKeyPassword\n` +
    `${END}\n`;

  return `${contents.slice(0, insertAt)}${block}${contents.slice(insertAt)}`;
}

function replaceSigningConfigs(contents) {
  const from = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;
  const to = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (hasReleaseSigning) {
                storeFile rootProject.file(releaseStoreFile)
                storePassword releaseStorePassword
                keyAlias releaseKeyAlias
                keyPassword releaseKeyPassword
            }
        }
    }`;
  return contents.includes(from) ? contents.replace(from, to) : contents;
}

function replaceReleaseBuildType(contents) {
  const from = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;
  const to = `        release {
            signingConfig hasReleaseSigning ? signingConfigs.release : signingConfigs.debug`;
  return contents.includes(from) ? contents.replace(from, to) : contents;
}

module.exports = function withOptionalReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    if (c.modResults.language !== 'groovy') return c;
    let contents = c.modResults.contents;
    contents = upsertImport(contents);
    contents = upsertSigningProps(contents);
    contents = replaceSigningConfigs(contents);
    contents = replaceReleaseBuildType(contents);
    c.modResults.contents = contents;
    return c;
  });
};
