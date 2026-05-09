const { getDefaultConfig } = require('expo/metro-config');
// biome-ignore lint/style/useNodejsImportProtocol: Metro requires bare path resolve
const path = require('path');

const config = getDefaultConfig(__dirname);

config.transformer.getTransformOptions = async () => ({
  transform: {
    inlineRequires: true,
  },
});

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (moduleName.startsWith('@/')) {
      const relativePath = moduleName.slice(2);
      const resolvedPath = path.resolve(__dirname, './src', relativePath);
      return context.resolveRequest(context, resolvedPath, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
