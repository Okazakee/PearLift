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

await patchDraggableFlatList();
await patchExpoAv();
