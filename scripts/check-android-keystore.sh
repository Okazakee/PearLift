#!/usr/bin/env bash

set -euo pipefail

if ! command -v keytool >/dev/null 2>&1; then
  echo "keytool not found. Install a JDK first." >&2
  exit 1
fi

KEYSTORE_PATH="${1:-}"
STORE_PASSWORD="${2:-}"
KEY_ALIAS="${3:-}"
KEY_PASSWORD="${4:-}"

if [[ -z "${KEYSTORE_PATH}" || -z "${STORE_PASSWORD}" || -z "${KEY_ALIAS}" || -z "${KEY_PASSWORD}" ]]; then
  echo "Usage: $0 <keystore-path> <store-password> <key-alias> <key-password>" >&2
  exit 1
fi

if [[ ! -f "${KEYSTORE_PATH}" ]]; then
  echo "Keystore file not found: ${KEYSTORE_PATH}" >&2
  exit 1
fi

if ! keytool -list -keystore "${KEYSTORE_PATH}" -storepass "${STORE_PASSWORD}" >/dev/null 2>&1; then
  echo "Keystore password does not match file: ${KEYSTORE_PATH}" >&2
  exit 1
fi

if ! keytool -list -alias "${KEY_ALIAS}" -keystore "${KEYSTORE_PATH}" -storepass "${STORE_PASSWORD}" >/dev/null 2>&1; then
  echo "Alias '${KEY_ALIAS}' not found in keystore: ${KEYSTORE_PATH}" >&2
  exit 1
fi

if ! keytool -keypasswd \
  -alias "${KEY_ALIAS}" \
  -keystore "${KEYSTORE_PATH}" \
  -storepass "${STORE_PASSWORD}" \
  -keypass "${KEY_PASSWORD}" \
  -new "${KEY_PASSWORD}" >/dev/null 2>&1; then
  echo "Key password does not match alias '${KEY_ALIAS}' in keystore: ${KEYSTORE_PATH}" >&2
  exit 1
fi
