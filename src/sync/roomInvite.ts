import { fromByteArray, toByteArray } from 'base64-js';

const ROOM_INVITE_PREFIX = 'pearlift-sync-room:v1:';
const HEX_32_BYTES = /^[0-9a-f]{64}$/;

export interface SyncRoomInvite {
  pairingSecretHex: string;
  bootstrapKeyHex: string | null;
}

function normalizeHex(value: string) {
  return value.trim().toLowerCase();
}

function assertHexKey(value: string, label: string) {
  const normalized = normalizeHex(value);
  if (!HEX_32_BYTES.test(normalized)) {
    throw new Error(`${label} must be 64 hex characters.`);
  }
  return normalized;
}

function encodeAscii(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

function decodeAscii(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) {
    value += String.fromCharCode(byte);
  }
  return value;
}

function toBase64Url(value: string) {
  return fromByteArray(encodeAscii(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function fromBase64Url(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  return decodeAscii(toByteArray(padded.replaceAll('-', '+').replaceAll('_', '/')));
}

export function encodeSyncRoomInvite(invite: SyncRoomInvite) {
  const pairingSecretHex = assertHexKey(
    invite.pairingSecretHex,
    'Pairing secret',
  );
  const bootstrapKeyHex = invite.bootstrapKeyHex
    ? assertHexKey(invite.bootstrapKeyHex, 'Bootstrap key')
    : null;

  return `${ROOM_INVITE_PREFIX}${toBase64Url(
    JSON.stringify({ pairingSecretHex, bootstrapKeyHex }),
  )}`;
}

export function decodeSyncRoomInvite(payload: string): SyncRoomInvite {
  const normalized = payload.trim();
  const lower = normalized.toLowerCase();

  if (HEX_32_BYTES.test(lower)) {
    return { pairingSecretHex: lower, bootstrapKeyHex: null };
  }

  if (!normalized.startsWith(ROOM_INVITE_PREFIX)) {
    throw new Error('Invalid sync room invite.');
  }

  const rawJson = fromBase64Url(normalized.slice(ROOM_INVITE_PREFIX.length));
  const parsed = JSON.parse(rawJson) as Partial<SyncRoomInvite>;

  return {
    pairingSecretHex: assertHexKey(
      parsed.pairingSecretHex ?? '',
      'Pairing secret',
    ),
    bootstrapKeyHex: parsed.bootstrapKeyHex
      ? assertHexKey(parsed.bootstrapKeyHex, 'Bootstrap key')
      : null,
  };
}
