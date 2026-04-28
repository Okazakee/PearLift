#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="${ROOT_DIR}/android"
GRADLE_FILE="${ANDROID_DIR}/app/build.gradle"
DEFAULT_ABIS="armeabi-v7a,arm64-v8a"
RELEASE_ABIS="${PEARLIFT_RELEASE_ABIS:-${DEFAULT_ABIS}}"
ENV_FILE="${ROOT_DIR}/.env.local"
KEYSTORE_PROPS_FILE="${ANDROID_DIR}/keystore.properties"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a && source "${ENV_FILE}" && set +a
fi

if [[ ! -f "${GRADLE_FILE}" ]]; then
  echo "Android project missing. Running Expo prebuild for Android..."
  bunx expo prebuild --platform android
fi

if [[ ! -f "${KEYSTORE_PROPS_FILE}" ]]; then
  if [[ -n "${PEARLIFT_UPLOAD_STORE_FILE:-}" && -n "${PEARLIFT_UPLOAD_STORE_PASSWORD:-}" && -n "${PEARLIFT_UPLOAD_KEY_ALIAS:-}" && -n "${PEARLIFT_UPLOAD_KEY_PASSWORD:-}" ]]; then
    cat > "${KEYSTORE_PROPS_FILE}" <<EOF
PEARLIFT_UPLOAD_STORE_FILE=${PEARLIFT_UPLOAD_STORE_FILE}
PEARLIFT_UPLOAD_STORE_PASSWORD=${PEARLIFT_UPLOAD_STORE_PASSWORD}
PEARLIFT_UPLOAD_KEY_ALIAS=${PEARLIFT_UPLOAD_KEY_ALIAS}
PEARLIFT_UPLOAD_KEY_PASSWORD=${PEARLIFT_UPLOAD_KEY_PASSWORD}
EOF
  fi
fi

if [[ ! -f "${KEYSTORE_PROPS_FILE}" ]]; then
  echo "Missing android/keystore.properties and no signing values were loaded." >&2
  echo "Run: bun run android:keygen" >&2
  exit 1
fi

if [[ -z "${PEARLIFT_UPLOAD_STORE_FILE:-}" || -z "${PEARLIFT_UPLOAD_STORE_PASSWORD:-}" || -z "${PEARLIFT_UPLOAD_KEY_ALIAS:-}" || -z "${PEARLIFT_UPLOAD_KEY_PASSWORD:-}" ]]; then
  echo "Signing variables were not loaded correctly." >&2
  echo "Check android/keystore.properties or .env.local." >&2
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
