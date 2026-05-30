import { describe, expect, test } from 'bun:test';
import { decodeSyncRoomInvite, encodeSyncRoomInvite } from '@/sync/roomInvite';

describe('sync room invite codec', () => {
  const pairingSecretHex = 'a'.repeat(64);
  const bootstrapKeyHex = 'b'.repeat(64);

  function expectThrows(action: () => unknown) {
    let didThrow = false;
    try {
      action();
    } catch {
      didThrow = true;
    }
    expect(didThrow).toBe(true);
  }

  test('encodes and decodes a full invite payload', () => {
    const payload = encodeSyncRoomInvite({
      pairingSecretHex,
      bootstrapKeyHex,
    });

    expect(decodeSyncRoomInvite(payload)).toEqual({
      pairingSecretHex,
      bootstrapKeyHex,
    });
  });

  test('decodes a bare pairing secret as a legacy invite', () => {
    expect(decodeSyncRoomInvite(pairingSecretHex)).toEqual({
      pairingSecretHex,
      bootstrapKeyHex: null,
    });
  });

  test('normalizes uppercase keys during encode/decode', () => {
    const payload = encodeSyncRoomInvite({
      pairingSecretHex: pairingSecretHex.toUpperCase(),
      bootstrapKeyHex: bootstrapKeyHex.toUpperCase(),
    });

    expect(decodeSyncRoomInvite(payload)).toEqual({
      pairingSecretHex,
      bootstrapKeyHex,
    });
  });

  test('accepts room invite prefixes with different casing', () => {
    const payload = encodeSyncRoomInvite({
      pairingSecretHex,
      bootstrapKeyHex,
    }).replace('v1', 'V1');

    expect(decodeSyncRoomInvite(payload)).toEqual({
      pairingSecretHex,
      bootstrapKeyHex,
    });
  });

  test('rejects invalid invite payloads', () => {
    expectThrows(() => decodeSyncRoomInvite('pearlift-sync-room:v1:bad'));
    expectThrows(() => decodeSyncRoomInvite('invalid-room-invite'));
  });
});
