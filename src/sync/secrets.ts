import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

export const SYNC_SECRET_KEY = 'pearlift.sync.secret';

export function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function normalizePairingSecretHex(secretHex: string) {
  return secretHex.trim().toLowerCase();
}

export async function loadOrCreatePairingSecret() {
  const existing = await SecureStore.getItemAsync(SYNC_SECRET_KEY);
  if (existing) return existing;
  const bytes = await Crypto.getRandomBytesAsync(32);
  const generated = toHex(bytes);
  await SecureStore.setItemAsync(SYNC_SECRET_KEY, generated);
  return generated;
}

export async function getPairingSecretPayload(): Promise<string> {
  return loadOrCreatePairingSecret();
}

export async function setPairingSecretPayload(secretHex: string): Promise<void> {
  const normalized = normalizePairingSecretHex(secretHex);
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('Pairing secret must be 64 hex characters.');
  }
  await SecureStore.setItemAsync(SYNC_SECRET_KEY, normalized);
}

export async function clearPairingSecret(): Promise<void> {
  await SecureStore.deleteItemAsync(SYNC_SECRET_KEY);
}
