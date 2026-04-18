import { base64 } from '@scure/base';

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string length.');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    const offset = index * 2;
    bytes[index] = Number.parseInt(hex.slice(offset, offset + 2), 16);
  }
  return bytes;
}

export function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function bytesToUtf8(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

export function bytesToBase64(value: Uint8Array): string {
  return base64.encode(value);
}

export function base64ToBytes(value: string): Uint8Array {
  return base64.decode(value);
}
