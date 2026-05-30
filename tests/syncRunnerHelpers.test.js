import { describe, expect, test } from 'bun:test';
import {
  encodeSyncInvite,
  extractBootstrapKey,
  extractDiagnostics,
  extractPairingSecret,
} from '../scripts/e2e/syncRunnerHelpers.mjs';

describe('syncRunnerHelpers', () => {
  test('extracts pairing secret and bootstrap key markers', () => {
    const text = [
      'noise',
      `SYNC_PAIRING_SECRET=${'a'.repeat(64)}`,
      `SYNC_BOOTSTRAP_KEY=${'b'.repeat(64)}`,
    ].join('\n');

    expect(extractPairingSecret(text)).toBe('a'.repeat(64));
    expect(extractBootstrapKey(text)).toBe('b'.repeat(64));
  });

  test('encodes a room invite payload compatible with app format', () => {
    const payload = encodeSyncInvite('a'.repeat(64), 'b'.repeat(64));

    expect(payload.startsWith('pearlift-sync-room:v1:')).toBe(true);
  });

  test('extracts diagnostics from a raw JSON log line', () => {
    const diagnostics = extractDiagnostics(
      [
        'noise',
        JSON.stringify({
          type: 'SYNC_DIAGNOSTICS',
          roomState: 'bound',
          firstSyncResolution: 'applied_remote',
          autobaseKey: 'key-1',
        }),
      ].join('\n'),
    );

    expect(diagnostics).toEqual({
      type: 'SYNC_DIAGNOSTICS',
      roomState: 'bound',
      firstSyncResolution: 'applied_remote',
      autobaseKey: 'key-1',
    });
  });

  test('extracts diagnostics from a prefixed helper line', () => {
    const diagnostics = extractDiagnostics(
      [
        'noise',
        `SYNC_DIAGNOSTICS_JOINER=${JSON.stringify({
          type: 'SYNC_DIAGNOSTICS',
          roomState: 'pending_first_sync',
          firstSyncResolution: 'none',
          autobaseKey: 'key-2',
        })}`,
      ].join('\n'),
    );

    expect(diagnostics).toEqual({
      type: 'SYNC_DIAGNOSTICS',
      roomState: 'pending_first_sync',
      firstSyncResolution: 'none',
      autobaseKey: 'key-2',
    });
  });

  test('extracts diagnostics from Maestro metadata lines', () => {
    const diagnostics = extractDiagnostics(
      [
        'noise',
        'logMessages=[{"type":"SYNC_DIAGNOSTICS","roomState":"active","firstSyncResolution":"auto_publish_local","autobaseKey":"key-3"}], insight=Insight(message=, level=NONE)',
      ].join('\n'),
    );

    expect(diagnostics).toEqual({
      type: 'SYNC_DIAGNOSTICS',
      roomState: 'active',
      firstSyncResolution: 'auto_publish_local',
      autobaseKey: 'key-3',
    });
  });
});
