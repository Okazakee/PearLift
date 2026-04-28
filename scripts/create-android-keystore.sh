#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYSTORE_DIR="${ROOT_DIR}/.local/keystores"
KEYSTORE_PATH="${PEARLIFT_UPLOAD_STORE_FILE:-${KEYSTORE_DIR}/pearlift-upload.jks}"
ANDROID_DIR="${ROOT_DIR}/android"
KEYSTORE_PROPS_PATH="${ROOT_DIR}/android/keystore.properties"
ENV_FILE_PATH="${ROOT_DIR}/.env.local"
KEY_ALIAS="${PEARLIFT_UPLOAD_KEY_ALIAS:-pearlift-upload}"
VALIDITY_DAYS="${PEARLIFT_KEY_VALIDITY_DAYS:-9125}"
KEY_ALG="${PEARLIFT_KEY_ALG:-RSA}"
KEY_SIZE="${PEARLIFT_KEY_SIZE:-4096}"
STORETYPE="${PEARLIFT_KEYSTORE_TYPE:-JKS}"
KEY_DNAME="${PEARLIFT_KEYSTORE_DNAME:-CN=PearLift, OU=Development, O=PearLift, L=Unknown, S=Unknown, C=US}"

if ! command -v keytool >/dev/null 2>&1; then
  echo "keytool not found. Install a JDK first." >&2
  exit 1
fi

mkdir -p "${KEYSTORE_DIR}"

if [[ -z "${PEARLIFT_UPLOAD_STORE_PASSWORD:-}" ]]; then
  read -r -s -p "Keystore password: " PEARLIFT_UPLOAD_STORE_PASSWORD
  echo
fi

if [[ -z "${PEARLIFT_UPLOAD_KEY_PASSWORD:-}" ]]; then
  read -r -s -p "Key password (leave empty to reuse keystore password): " PEARLIFT_UPLOAD_KEY_PASSWORD
  echo
fi

if [[ -z "${PEARLIFT_UPLOAD_KEY_PASSWORD}" ]]; then
  PEARLIFT_UPLOAD_KEY_PASSWORD="${PEARLIFT_UPLOAD_STORE_PASSWORD}"
fi

if [[ ${#PEARLIFT_UPLOAD_STORE_PASSWORD} -lt 6 ]]; then
  echo "Keystore password must be at least 6 characters." >&2
  exit 1
fi

if [[ ${#PEARLIFT_UPLOAD_KEY_PASSWORD} -lt 6 ]]; then
  echo "Key password must be at least 6 characters." >&2
  exit 1
fi

created_keystore=false

if [[ -f "${KEYSTORE_PATH}" ]]; then
  if "${ROOT_DIR}/scripts/check-android-keystore.sh" \
    "${KEYSTORE_PATH}" \
    "${PEARLIFT_UPLOAD_STORE_PASSWORD}" \
    "${KEY_ALIAS}" \
    "${PEARLIFT_UPLOAD_KEY_PASSWORD}" >/dev/null 2>&1; then
    echo "Keystore already exists, refreshing local signing config:"
    echo "  ${KEYSTORE_PATH}"
  else
    if [[ "${PEARLIFT_FORCE_KEYSTORE_RECREATE:-0}" != "1" ]]; then
      echo "Existing keystore does not match the supplied password or alias:" >&2
      echo "  ${KEYSTORE_PATH}" >&2
      echo "If this app has not been published yet, rerun with PEARLIFT_FORCE_KEYSTORE_RECREATE=1 to replace it." >&2
      echo "If it has been published, recover the original keystore credentials instead of replacing it." >&2
      exit 1
    fi

    rm -f "${KEYSTORE_PATH}"
    keytool -genkeypair \
      -v \
      -keystore "${KEYSTORE_PATH}" \
      -storetype "${STORETYPE}" \
      -alias "${KEY_ALIAS}" \
      -keyalg "${KEY_ALG}" \
      -keysize "${KEY_SIZE}" \
      -dname "${KEY_DNAME}" \
      -validity "${VALIDITY_DAYS}" \
      -storepass "${PEARLIFT_UPLOAD_STORE_PASSWORD}" \
      -keypass "${PEARLIFT_UPLOAD_KEY_PASSWORD}"
    created_keystore=true
  fi
else
  keytool -genkeypair \
    -v \
    -keystore "${KEYSTORE_PATH}" \
    -storetype "${STORETYPE}" \
    -alias "${KEY_ALIAS}" \
    -keyalg "${KEY_ALG}" \
    -keysize "${KEY_SIZE}" \
    -dname "${KEY_DNAME}" \
    -validity "${VALIDITY_DAYS}" \
    -storepass "${PEARLIFT_UPLOAD_STORE_PASSWORD}" \
    -keypass "${PEARLIFT_UPLOAD_KEY_PASSWORD}"
  created_keystore=true
fi

cat > "${ENV_FILE_PATH}" <<EOF
PEARLIFT_UPLOAD_STORE_FILE=${KEYSTORE_PATH}
PEARLIFT_UPLOAD_STORE_PASSWORD=${PEARLIFT_UPLOAD_STORE_PASSWORD}
PEARLIFT_UPLOAD_KEY_ALIAS=${KEY_ALIAS}
PEARLIFT_UPLOAD_KEY_PASSWORD=${PEARLIFT_UPLOAD_KEY_PASSWORD}
EOF

keystore_props_written=false

if [[ -d "${ANDROID_DIR}" ]]; then
  cat > "${KEYSTORE_PROPS_PATH}" <<EOF
PEARLIFT_UPLOAD_STORE_FILE=${KEYSTORE_PATH}
PEARLIFT_UPLOAD_STORE_PASSWORD=${PEARLIFT_UPLOAD_STORE_PASSWORD}
PEARLIFT_UPLOAD_KEY_ALIAS=${KEY_ALIAS}
PEARLIFT_UPLOAD_KEY_PASSWORD=${PEARLIFT_UPLOAD_KEY_PASSWORD}
EOF
  keystore_props_written=true
fi

cat <<EOF

Keystore:
  ${KEYSTORE_PATH}

Local env file created:
  ${ENV_FILE_PATH}

You can now build locally without exporting env vars, even after expo prebuild --clean.

Keep this keystore backed up securely. Losing it will break future updates.
EOF

if [[ "${keystore_props_written}" == "true" ]]; then
  cat <<EOF

Gradle signing file created:
  ${KEYSTORE_PROPS_PATH}
EOF
else
  cat <<EOF

Android project not present yet, so Gradle signing file was not written.
It will be regenerated automatically from .env.local on the first Android prebuild/release build.
EOF
fi
