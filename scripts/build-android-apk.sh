#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="${ROOT_DIR}/android"
GRADLE_FILE="${ANDROID_DIR}/app/build.gradle"
DEFAULT_ABIS="arm64-v8a"
RELEASE_ABIS="${PEARLIFT_RELEASE_ABIS:-${DEFAULT_ABIS}}"
PREBUILD_CLEAN="${PEARLIFT_PREBUILD_CLEAN:-1}"
REQUIRE_RELEASE_KEY="${PEARLIFT_REQUIRE_RELEASE_KEY:-0}"
ENV_FILE="${ROOT_DIR}/.env.local"
KEYSTORE_PROPERTIES="${ANDROID_DIR}/keystore.properties"

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

if [[ "${REQUIRE_RELEASE_KEY}" == "1" ]]; then
  if [[ ! -f "${KEYSTORE_PROPERTIES}" ]]; then
    echo "Missing ${KEYSTORE_PROPERTIES}. Required for release-key signing." >&2
    exit 1
  fi
  for key in storeFile storePassword keyAlias keyPassword; do
    if ! rg -q "^${key}=.+" "${KEYSTORE_PROPERTIES}"; then
      echo "Missing ${key} in ${KEYSTORE_PROPERTIES}." >&2
      exit 1
    fi
  done
fi

cd "${ANDROID_DIR}"

if command -v bunx >/dev/null 2>&1; then
  bunx expo run:android \
    --variant release \
    --gradle-args "-PreactNativeArchitectures=${RELEASE_ABIS}"
else
  npx --yes expo run:android \
    --variant release \
    --gradle-args "-PreactNativeArchitectures=${RELEASE_ABIS}"
fi

echo
echo "APK ready:"
echo "  ${ANDROID_DIR}/app/build/outputs/apk/release/"
