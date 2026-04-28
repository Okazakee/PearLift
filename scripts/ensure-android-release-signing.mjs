import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const gradlePath = resolve(projectRoot, 'android/app/build.gradle');

const importSnippet = `import java.util.Properties

def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("keystore.properties")

if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.withInputStream { stream ->
        keystoreProperties.load(stream)
    }
}
`;

const signingSnippet = `def releaseStoreFile = findProperty('PEARLIFT_UPLOAD_STORE_FILE') ?: keystoreProperties.getProperty('PEARLIFT_UPLOAD_STORE_FILE') ?: System.getenv('PEARLIFT_UPLOAD_STORE_FILE')
def releaseStorePassword = findProperty('PEARLIFT_UPLOAD_STORE_PASSWORD') ?: keystoreProperties.getProperty('PEARLIFT_UPLOAD_STORE_PASSWORD') ?: System.getenv('PEARLIFT_UPLOAD_STORE_PASSWORD')
def releaseKeyAlias = findProperty('PEARLIFT_UPLOAD_KEY_ALIAS') ?: keystoreProperties.getProperty('PEARLIFT_UPLOAD_KEY_ALIAS') ?: System.getenv('PEARLIFT_UPLOAD_KEY_ALIAS')
def releaseKeyPassword = findProperty('PEARLIFT_UPLOAD_KEY_PASSWORD') ?: keystoreProperties.getProperty('PEARLIFT_UPLOAD_KEY_PASSWORD') ?: System.getenv('PEARLIFT_UPLOAD_KEY_PASSWORD')
def hasReleaseSigning = releaseStoreFile && releaseStorePassword && releaseKeyAlias && releaseKeyPassword
`;

const workletsDependencyLine =
  '    implementation(project(":react-native-worklets"))';

async function main() {
  if (!existsSync(gradlePath)) {
    console.error(
      'android/app/build.gradle not found. Run `bun run prebuild:android` or `expo prebuild --platform android` first.',
    );
    process.exit(1);
  }

  let text = await readFile(gradlePath, 'utf8');
  const original = text;

  if (!text.includes('import java.util.Properties')) {
    text = text.replace(
      'apply plugin: "com.facebook.react"\n\ndef projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()\n',
      `apply plugin: "com.facebook.react"\n\n${importSnippet}`,
    );
  }

  if (
    !text.includes(
      "def releaseStoreFile = findProperty('PEARLIFT_UPLOAD_STORE_FILE')",
    )
  ) {
    text = text.replace(
      "def enableMinifyInReleaseBuilds = (findProperty('android.enableMinifyInReleaseBuilds') ?: false).toBoolean()\n",
      `def enableMinifyInReleaseBuilds = (findProperty('android.enableMinifyInReleaseBuilds') ?: false).toBoolean()\n\n${signingSnippet}\n`,
    );
  }

  text = text.replace(
    `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
`,
    `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (hasReleaseSigning) {
                storeFile file(releaseStoreFile)
                storePassword releaseStorePassword
                keyAlias releaseKeyAlias
                keyPassword releaseKeyPassword
            }
        }
    }
`,
  );

  text = text.replace(
    `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
`,
    `        release {
            if (!hasReleaseSigning) {
                throw new GradleException("Missing release signing config. Set PEARLIFT_UPLOAD_STORE_FILE, PEARLIFT_UPLOAD_STORE_PASSWORD, PEARLIFT_UPLOAD_KEY_ALIAS, and PEARLIFT_UPLOAD_KEY_PASSWORD.")
            }
            signingConfig signingConfigs.release
`,
  );

  if (!text.includes(workletsDependencyLine)) {
    text = text.replace(
      '    implementation("com.facebook.react:react-android")\n',
      `    implementation("com.facebook.react:react-android")\n${workletsDependencyLine}\n`,
    );
  }

  if (text !== original) {
    await writeFile(gradlePath, text, 'utf8');
  }
}

await main();
