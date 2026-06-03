#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BARE_KIT_SRC="${1:?Usage: $0 <bare-kit-srclib-path>}"
NDK_PATH="${2:?Usage: $0 <bare-kit-srclib-path> <ndk-path>}"
BUILD_DIR="${3:-/tmp/bare-kit-build}"

echo "[build-bare-kit] Installing bare-kit npm dependencies..."
(cd "${BARE_KIT_SRC}" && npm install)

echo "[build-bare-kit] Configuring CMake..."
cmake -S "${BARE_KIT_SRC}" -B "${BUILD_DIR}" \
  -DCMAKE_TOOLCHAIN_FILE="${NDK_PATH}/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI=arm64-v8a \
  -DANDROID_PLATFORM=28 \
  -DCMAKE_BUILD_TYPE=Release

echo "[build-bare-kit] Building..."
cmake --build "${BUILD_DIR}" --target bare_kit -j"$(nproc)"

echo "[build-bare-kit] Copying libbare-kit.so..."
mkdir -p "${ROOT_DIR}/node_modules/react-native-bare-kit/android/libs/bare-kit/jni/arm64-v8a"
cp "${BUILD_DIR}/android/libbare-kit.so" \
  "${ROOT_DIR}/node_modules/react-native-bare-kit/android/libs/bare-kit/jni/arm64-v8a/"

echo "[build-bare-kit] Done."
