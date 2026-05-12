Object.defineProperty(exports, '__esModule', {
  value: true,
});
exports.decodeBase64 = decodeBase64;
var _reactNative = require('react-native');
const LINKING_ERROR =
  `The package 'vision-camera-zxing' doesn't seem to be linked. Make sure: \n\n` +
  _reactNative.Platform.select({
    ios: "- You have run 'pod install'\n",
    default: '',
  }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';
const VisionCameraZXing = _reactNative.NativeModules.VisionCameraZXing
  ? _reactNative.NativeModules.VisionCameraZXing
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    );

function decodeBase64(base64, config) {
  return VisionCameraZXing.decodeBase64(base64, config);
}
//# sourceMappingURL=index.js.map
