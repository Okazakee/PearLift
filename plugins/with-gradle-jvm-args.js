// Local Expo config plugin: ensure org.gradle.jvmargs survives repeated
// prebuilds (including --clean). KSP + lint need more Metaspace and heap
// than the Expo template default (512m Metaspace, 2g heap).

const {
  createBuildGradlePropsConfigPlugin,
} = require('@expo/config-plugins/build/android/BuildProperties');

module.exports = createBuildGradlePropsConfigPlugin(
  [
    {
      propName: 'org.gradle.jvmargs',
      propValueGetter: () => '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
    },
  ],
  'withGradleJvmArgs',
);
