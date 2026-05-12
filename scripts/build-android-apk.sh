#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="${ROOT_DIR}/android"
GRADLE_FILE="${ANDROID_DIR}/app/build.gradle"
DEFAULT_ABIS="arm64-v8a"
RELEASE_ABIS="${PEARLIFT_RELEASE_ABIS:-${DEFAULT_ABIS}}"
FDROID_SPLITS="${PEARLIFT_FDROID_SPLITS:-0}"
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

GRADLE_ARGS=(
  assembleRelease
  "-PreactNativeArchitectures=${RELEASE_ABIS}"
)

if [[ "${FDROID_SPLITS}" == "1" ]]; then
  GRADLE_ARGS+=("-PpearliftAbiSplits=true")
fi

./gradlew "${GRADLE_ARGS[@]}"

APK_OUTPUT_DIR="${ANDROID_DIR}/app/build/outputs/apk/release"
if [[ ! -d "${APK_OUTPUT_DIR}" ]]; then
  echo "APK build completed but output directory was not created:" >&2
  echo "  ${APK_OUTPUT_DIR}" >&2
  exit 1
fi

if ! find "${APK_OUTPUT_DIR}" -maxdepth 1 -type f -name "*.apk" | grep -q .; then
  echo "APK build completed but no APK files were produced in:" >&2
  echo "  ${APK_OUTPUT_DIR}" >&2
  exit 1
fi

if [[ "${FDROID_SPLITS}" == "1" ]]; then
  REQUIRED_APKS=(
    "${APK_OUTPUT_DIR}/app-armeabi-v7a-release.apk"
    "${APK_OUTPUT_DIR}/app-arm64-v8a-release.apk"
  )
  for apk in "${REQUIRED_APKS[@]}"; do
    if [[ ! -f "${apk}" ]]; then
      echo "F-Droid split build is missing expected APK:" >&2
      echo "  ${apk}" >&2
      exit 1
    fi
  done
fi

echo
echo "APK ready:"
echo "  ${APK_OUTPUT_DIR}/"
