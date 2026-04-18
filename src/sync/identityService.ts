import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as secp from '@noble/secp256k1';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { bytesToHex, hexToBytes, utf8ToBytes } from '../utils/encoding';
import type { SyncIdentity } from './types';

const STORE_KEYS = {
  masterSeedHex: 'pearlift.sync.masterSeedHex',
  deviceId: 'pearlift.sync.deviceId',
  provisionedAt: 'pearlift.sync.provisionedAt',
} as const;

let hashesConfigured = false;

function ensureSecpHashes() {
  if (hashesConfigured) {
    return;
  }
  secp.hashes.sha256 = sha256;
  secp.hashes.hmacSha256 = (key, message) => hmac(sha256, key, message);
  secp.hashes.sha256Async = async (message) => sha256(message);
  secp.hashes.hmacSha256Async = async (key, message) =>
    hmac(sha256, key, message);
  hashesConfigured = true;
}

async function getStoredValue(key: string) {
  return SecureStore.getItemAsync(key);
}

async function setStoredValue(key: string, value: string) {
  await SecureStore.setItemAsync(key, value);
}

async function getOrCreateValue(key: string, factory: () => string) {
  const current = await getStoredValue(key);
  if (current) {
    return current;
  }

  const next = factory();
  await setStoredValue(key, next);
  return next;
}

function deriveSecretKey(masterSeedHex: string, label: string) {
  const digest = sha256(utf8ToBytes(`${label}:${masterSeedHex}`));
  return bytesToHex(digest);
}

function buildIdentity(input: {
  deviceId: string;
  masterSeedHex: string;
  provisionedAt: string;
}): SyncIdentity {
  ensureSecpHashes();
  const nostrSecretKeyHex = deriveSecretKey(input.masterSeedHex, 'nostr');
  const backupKeyHex = deriveSecretKey(input.masterSeedHex, 'backup');
  const holepunchMasterKeyHex = deriveSecretKey(
    input.masterSeedHex,
    'holepunch-master',
  );
  const holepunchStaticKeyHex = deriveSecretKey(
    input.masterSeedHex,
    'holepunch-static',
  );
  const holepunchPeerId = deriveSecretKey(
    input.masterSeedHex,
    'holepunch-peer-id',
  ).slice(0, 32);
  const masterFingerprint = deriveSecretKey(
    input.masterSeedHex,
    'fingerprint',
  ).slice(0, 16);
  const nostrPubkey = bytesToHex(
    secp.schnorr.getPublicKey(hexToBytes(nostrSecretKeyHex)),
  );

  return {
    deviceId: input.deviceId,
    masterFingerprint,
    nostrPubkey,
    masterSeedHex: input.masterSeedHex,
    nostrSecretKeyHex,
    backupKeyHex,
    holepunchMasterKeyHex,
    holepunchStaticKeyHex,
    holepunchPeerId,
    provisionedAt: input.provisionedAt,
  };
}

export class IdentityService {
  async getOrCreateDeviceId() {
    return getOrCreateValue(STORE_KEYS.deviceId, () => Crypto.randomUUID());
  }

  async loadProvisionedIdentity(): Promise<SyncIdentity | null> {
    const [masterSeedHex, deviceId, provisionedAt] = await Promise.all([
      getStoredValue(STORE_KEYS.masterSeedHex),
      this.getOrCreateDeviceId(),
      getStoredValue(STORE_KEYS.provisionedAt),
    ]);

    if (!masterSeedHex || !provisionedAt) {
      return null;
    }

    return buildIdentity({
      deviceId,
      masterSeedHex,
      provisionedAt,
    });
  }

  async provisionIdentity(): Promise<SyncIdentity> {
    const deviceId = await this.getOrCreateDeviceId();
    const masterSeedHex = await getOrCreateValue(STORE_KEYS.masterSeedHex, () =>
      bytesToHex(Crypto.getRandomBytes(32)),
    );
    const existingProvisionedAt = await getStoredValue(
      STORE_KEYS.provisionedAt,
    );
    const provisionedAt = existingProvisionedAt ?? new Date().toISOString();

    if (!existingProvisionedAt) {
      await setStoredValue(STORE_KEYS.provisionedAt, provisionedAt);
    }

    return buildIdentity({
      deviceId,
      masterSeedHex,
      provisionedAt,
    });
  }
}
