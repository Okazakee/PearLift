import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package 'vision-camera-zxing' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const VisionCameraZXing = NativeModules.VisionCameraZXing
  ? NativeModules.VisionCameraZXing
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    );

export function decodeBase64(
  base64: string,
  config?: ScanConfig,
): Promise<Result[]> {
  return VisionCameraZXing.decodeBase64(base64, config);
}

export interface ScanConfig {
  multiple?: boolean;
}

export interface Result {
  barcodeText: string;
  barcodeFormat: string;
  barcodeBytesBase64: string;
  points: { x: number; y: number }[];
}
