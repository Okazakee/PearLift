#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="${ROOT_DIR}/android"
GRADLE_FILE="${ANDROID_DIR}/app/build.gradle"
DEFAULT_ABIS="armeabi-v7a,arm64-v8a,x86,x86_64"
RELEASE_ABIS="${PEARLIFT_RELEASE_ABIS:-${DEFAULT_ABIS}}"
PREBUILD_CLEAN="${PEARLIFT_PREBUILD_CLEAN:-1}"
ENV_FILE="${ROOT_DIR}/.env.local"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a && source "${ENV_FILE}" && set +a
fi

if [[ ! -f "${GRADLE_FILE}" ]]; then
  echo "Android project missing. Running Expo prebuild for Android..."
  if command -v bunx >/dev/null 2>&1; then
    bunx expo prebuild --platform android
  else
    npx --yes expo prebuild --platform android
  fi
fi

if [[ "${PREBUILD_CLEAN}" != "0" ]]; then
  echo "Running Expo prebuild --clean for a reproducible release build..."
  if command -v bunx >/dev/null 2>&1; then
    bunx expo prebuild --clean --platform android
  else
    npx --yes expo prebuild --clean --platform android
  fi
fi

if [[ -z "${PEARLIFT_UPLOAD_STORE_FILE:-}" || -z "${PEARLIFT_UPLOAD_STORE_PASSWORD:-}" || -z "${PEARLIFT_UPLOAD_KEY_ALIAS:-}" || -z "${PEARLIFT_UPLOAD_KEY_PASSWORD:-}" ]]; then
  echo "Missing Android release signing variables." >&2
  echo "Set PEARLIFT_UPLOAD_STORE_FILE, PEARLIFT_UPLOAD_STORE_PASSWORD, PEARLIFT_UPLOAD_KEY_ALIAS, and PEARLIFT_UPLOAD_KEY_PASSWORD." >&2
  echo "You can keep them in .env.local if you want local convenience." >&2
  exit 1
fi

"${ROOT_DIR}/scripts/check-android-keystore.sh" \
  "${PEARLIFT_UPLOAD_STORE_FILE}" \
  "${PEARLIFT_UPLOAD_STORE_PASSWORD}" \
  "${PEARLIFT_UPLOAD_KEY_ALIAS}" \
  "${PEARLIFT_UPLOAD_KEY_PASSWORD}"

node "${ROOT_DIR}/scripts/ensure-android-release-signing.mjs"

cd "${ANDROID_DIR}"

./gradlew \
  bundleRelease \
  -PreactNativeArchitectures="${RELEASE_ABIS}"

echo
echo "AAB ready:"
echo "  ${ANDROID_DIR}/app/build/outputs/bundle/release/app-release.aab"
