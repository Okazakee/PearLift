import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

function replaceOnce(source, from, to) {
  if (!source.includes(from)) return source;
  return source.replace(from, to);
}

async function patchDraggableFlatList() {
  const file =
    'node_modules/react-native-draggable-flatlist/src/components/DraggableFlatList.tsx';
  if (!existsSync(file)) return;

  let text = await readFile(file, 'utf8');
  const original = text;

  // Remove deprecated InteractionManager usage (RN 0.83+ warns).
  text = text.replace(/\n\s*InteractionManager,\n/, '\n');
  text = text.replace(
    /InteractionManager\.runAfterInteractions\(\(\)\s*=>\s*\{\s*\n\s*reset\(\);\s*\n\s*\}\);\s*/m,
    'scheduleIdleTask(() => reset());',
  );

  if (!text.includes('function scheduleIdleTask(')) {
    text = replaceOnce(
      text,
      'const AnimatedFlatList = (Animated.createAnimatedComponent(\n  FlatList\n) as unknown) as <T>(props: RNGHFlatListProps<T>) => React.ReactElement;\n',
      "const AnimatedFlatList = (Animated.createAnimatedComponent(\n  FlatList\n) as unknown) as <T>(props: RNGHFlatListProps<T>) => React.ReactElement;\n\nfunction scheduleIdleTask(task: () => void) {\n  const ric = global?.requestIdleCallback as ((cb: () => void) => unknown) | undefined;\n  if (typeof ric === 'function') {\n    ric(task);\n    return;\n  }\n  setTimeout(task, 0);\n}\n",
    );
  }

  if (text !== original) {
    await writeFile(file, text, 'utf8');
  }
}

async function patchExpoAv() {
  const file =
    'node_modules/expo-av/android/src/main/java/expo/modules/av/ViewUtils.kt';
  if (!existsSync(file)) return;

  let text = await readFile(file, 'utf8');
  const original = text;

  text = text.replace(
    'import expo.modules.core.interfaces.services.UIManager\n',
    '',
  );
  text = text.replaceAll(
    'moduleRegistry.getModule(UIManager::class.java).resolveView(viewTag) as VideoViewWrapper?',
    'moduleRegistry.appContext?.findView<VideoViewWrapper>(viewTag)',
  );

  const fullscreenFile =
    'node_modules/expo-av/android/src/main/java/expo/modules/av/video/FullscreenVideoPlayer.java';
  if (existsSync(fullscreenFile)) {
    let fullscreenText = await readFile(fullscreenFile, 'utf8');
    const originalFullscreenText = fullscreenText;

    fullscreenText = fullscreenText.replace(
      'import expo.modules.core.ModuleRegistry;\n',
      '',
    );
    fullscreenText = fullscreenText.replace(
      'import expo.modules.core.interfaces.services.KeepAwakeManager;\n',
      '',
    );
    fullscreenText = fullscreenText.replace(
      `          AppContext appContext = fullscreenVideoPlayer.mAppContext.get();
          ModuleRegistry moduleRegistry = appContext != null ? appContext.getLegacyModuleRegistry() : null;
          if (moduleRegistry != null) {
            KeepAwakeManager keepAwakeManager = moduleRegistry.getModule(KeepAwakeManager.class);
            boolean keepAwakeIsActivated = keepAwakeManager != null && keepAwakeManager.isActivated();
            if (isPlaying || keepAwakeIsActivated) {
              window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
              window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
          }
`,
      `          if (isPlaying) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
          } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
          }
`,
    );

    if (fullscreenText !== originalFullscreenText) {
      await writeFile(fullscreenFile, fullscreenText, 'utf8');
    }
  }

  if (text !== original) {
    await writeFile(file, text, 'utf8');
  }
}

async function patchVisionCameraZxing() {
  const packageFile =
    'node_modules/vision-camera-zxing/android/src/main/java/com/visioncamerazxing/VisionCameraZXingPackage.java';
  if (existsSync(packageFile)) {
    let text = await readFile(packageFile, 'utf8');
    const original = text;

    text = text.replace(
      'import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry;\n',
      '',
    );
    text = text.replace(
      'public class VisionCameraZXingPackage implements ReactPackage {\n  static {\n    FrameProcessorPluginRegistry.addFrameProcessorPlugin("zxing", ZXingFrameProcessorPlugin::new);\n  }\n',
      'public class VisionCameraZXingPackage implements ReactPackage {\n',
    );

    if (text !== original) {
      await writeFile(packageFile, text, 'utf8');
    }
  }

  const bitmapUtilsFile =
    'node_modules/vision-camera-zxing/android/src/main/java/com/visioncamerazxing/BitmapUtils.java';
  if (existsSync(bitmapUtilsFile)) {
    await writeFile(
      bitmapUtilsFile,
      `package com.visioncamerazxing;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

public class BitmapUtils {
  public static Bitmap base642Bitmap(String base64) {
    byte[] decode = Base64.decode(base64, Base64.DEFAULT);
    return BitmapFactory.decodeByteArray(decode, 0, decode.length);
  }
}
`,
      'utf8',
    );
  }

  const frameProcessorFile =
    'node_modules/vision-camera-zxing/android/src/main/java/com/visioncamerazxing/ZXingFrameProcessorPlugin.java';
  if (existsSync(frameProcessorFile)) {
    await writeFile(
      frameProcessorFile,
      `package com.visioncamerazxing;

final class ZXingFrameProcessorPlugin {}
`,
      'utf8',
    );
  }

  const sourceIndexFile = 'node_modules/vision-camera-zxing/src/index.tsx';
  if (existsSync(sourceIndexFile)) {
    await writeFile(
      sourceIndexFile,
      `import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  \`The package 'vision-camera-zxing' doesn't seem to be linked. Make sure: \\n\\n\` +
  Platform.select({ ios: "- You have run 'pod install'\\n", default: '' }) +
  '- You rebuilt the app after installing the package\\n' +
  '- You are not using Expo Go\\n';

const VisionCameraZXing = NativeModules.VisionCameraZXing
  ? NativeModules.VisionCameraZXing
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

export function decodeBase64(base64: string, config?: ScanConfig): Promise<Result[]> {
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
`,
      'utf8',
    );
  }

  const commonJsFile = 'node_modules/vision-camera-zxing/lib/commonjs/index.js';
  if (existsSync(commonJsFile)) {
    await writeFile(
      commonJsFile,
      `"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.decodeBase64 = decodeBase64;
var _reactNative = require("react-native");
const LINKING_ERROR = \`The package 'vision-camera-zxing' doesn't seem to be linked. Make sure: \\n\\n\` + _reactNative.Platform.select({
  ios: "- You have run 'pod install'\\n",
  default: ''
}) + '- You rebuilt the app after installing the package\\n' + '- You are not using Expo Go\\n';
const VisionCameraZXing = _reactNative.NativeModules.VisionCameraZXing ? _reactNative.NativeModules.VisionCameraZXing : new Proxy({}, {
  get() {
    throw new Error(LINKING_ERROR);
  }
});

function decodeBase64(base64, config) {
  return VisionCameraZXing.decodeBase64(base64, config);
}
//# sourceMappingURL=index.js.map
`,
      'utf8',
    );
  }

  const moduleJsFile = 'node_modules/vision-camera-zxing/lib/module/index.js';
  if (existsSync(moduleJsFile)) {
    await writeFile(
      moduleJsFile,
      `"use strict";

import { NativeModules, Platform } from 'react-native';
const LINKING_ERROR = \`The package 'vision-camera-zxing' doesn't seem to be linked. Make sure: \\n\\n\` + Platform.select({
  ios: "- You have run 'pod install'\\n",
  default: ''
}) + '- You rebuilt the app after installing the package\\n' + '- You are not using Expo Go\\n';
const VisionCameraZXing = NativeModules.VisionCameraZXing ? NativeModules.VisionCameraZXing : new Proxy({}, {
  get() {
    throw new Error(LINKING_ERROR);
  }
});

export function decodeBase64(base64, config) {
  return VisionCameraZXing.decodeBase64(base64, config);
}
//# sourceMappingURL=index.js.map
`,
      'utf8',
    );
  }

  const typesFile =
    'node_modules/vision-camera-zxing/lib/typescript/src/index.d.ts';
  if (existsSync(typesFile)) {
    await writeFile(
      typesFile,
      `export declare function decodeBase64(base64: string, config?: ScanConfig): Promise<Result[]>;
export interface ScanConfig {
    multiple?: boolean;
}
export interface Result {
    barcodeText: string;
    barcodeFormat: string;
    barcodeBytesBase64: string;
    points: {
        x: number;
        y: number;
    }[];
}
//# sourceMappingURL=index.d.ts.map
`,
      'utf8',
    );
  }

  const iosSwiftFile =
    'node_modules/vision-camera-zxing/ios/ZXingFrameProcessorPlugin.swift';
  if (existsSync(iosSwiftFile)) {
    await writeFile(
      iosSwiftFile,
      `import Foundation

@objc(ZXingFrameProcessorPlugin)
public final class ZXingFrameProcessorPlugin: NSObject {}
`,
      'utf8',
    );
  }

  const iosObjcFile =
    'node_modules/vision-camera-zxing/ios/ZXingFrameProcessorPlugin.m';
  if (existsSync(iosObjcFile)) {
    await writeFile(iosObjcFile, '#import <Foundation/Foundation.h>\n', 'utf8');
  }

  const iosBridgeFile =
    'node_modules/vision-camera-zxing/ios/VisionCameraZXing-Bridging-Header.h';
  if (existsSync(iosBridgeFile)) {
    await writeFile(
      iosBridgeFile,
      '#import <React/RCTBridgeModule.h>\n',
      'utf8',
    );
  }
}

await patchDraggableFlatList();
await patchExpoAv();
await patchVisionCameraZxing();
