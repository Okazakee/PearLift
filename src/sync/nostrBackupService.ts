import type { PwaBackupV2 } from '../backup/types';
import type { BackupCodec } from './backupCodec';
import { PEARLIFT_BACKUP_KIND } from './constants';
import type {
  BackupPublishResult,
  BackupRestoreResult,
  NostrEvent,
  SyncIdentity,
} from './types';

interface RelayFetchCandidate {
  relayUrl: string;
  event: NostrEvent;
}

function waitForSocketOpen(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    const handleOpen = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Relay connection failed.'));
    };
    const cleanup = () => {
      socket.removeEventListener('open', handleOpen);
      socket.removeEventListener('error', handleError);
    };

    socket.addEventListener('open', handleOpen);
    socket.addEventListener('error', handleError);
  });
}

export class NostrBackupService {
  constructor(
    private readonly codec: BackupCodec,
    private readonly relayUrls: readonly string[],
  ) {}

  async publishBackup(input: {
    identity: SyncIdentity;
    backup: PwaBackupV2;
    snapshotVersion: number;
  }): Promise<BackupPublishResult> {
    const envelope = await this.codec.encryptSnapshot(input.identity, {
      snapshotVersion: input.snapshotVersion,
      backup: input.backup,
    });

    const event = await this.codec.createSignedEvent(input.identity, {
      kind: PEARLIFT_BACKUP_KIND,
      tags: [
        ['d', 'pearlift-backup'],
        ['device', input.identity.deviceId],
        ['schema', String(envelope.schemaVersion)],
        ['snapshotVersion', String(input.snapshotVersion)],
      ],
      content: this.codec.encodeEnvelope(envelope),
    });

    const settled = await Promise.allSettled(
      this.relayUrls.map(async (relayUrl) => {
        await this.publishToRelay(relayUrl, event);
        return relayUrl;
      }),
    );

    const successfulRelays = settled
      .filter(
        (entry): entry is PromiseFulfilledResult<string> =>
          entry.status === 'fulfilled',
      )
      .map((entry) => entry.value);

    if (successfulRelays.length === 0) {
      throw new Error('Backup publish failed on every configured relay.');
    }

    return {
      eventId: event.id,
      relayUrls: successfulRelays,
      createdAt: envelope.createdAt,
      snapshotVersion: input.snapshotVersion,
    };
  }

  async fetchLatestBackup(
    identity: SyncIdentity,
  ): Promise<BackupRestoreResult> {
    const settled = await Promise.allSettled(
      this.relayUrls.map((relayUrl) =>
        this.fetchFromRelay(relayUrl, identity.nostrPubkey),
      ),
    );

    const candidates = settled
      .filter(
        (entry): entry is PromiseFulfilledResult<RelayFetchCandidate | null> =>
          entry.status === 'fulfilled' && Boolean(entry.value),
      )
      .map((entry) => entry.value)
      .filter((value): value is RelayFetchCandidate => value !== null)
      .sort((left, right) => {
        if (left.event.created_at !== right.event.created_at) {
          return right.event.created_at - left.event.created_at;
        }
        const leftSnapshot = Number(
          left.event.tags.find((tag) => tag[0] === 'snapshotVersion')?.[1] ??
            '0',
        );
        const rightSnapshot = Number(
          right.event.tags.find((tag) => tag[0] === 'snapshotVersion')?.[1] ??
            '0',
        );
        return rightSnapshot - leftSnapshot;
      });

    for (const candidate of candidates) {
      const valid = await this.codec.verifyEventSignature(candidate.event);
      if (!valid) {
        continue;
      }
      const envelope = this.codec.decodeEnvelope(candidate.event.content);
      const snapshot = await this.codec.decryptEnvelope(identity, envelope);
      return {
        relayUrl: candidate.relayUrl,
        eventId: candidate.event.id,
        createdAt: envelope.createdAt,
        snapshotVersion: snapshot.snapshotVersion,
        backup: snapshot.backup,
      };
    }

    throw new Error('No valid relay backup found.');
  }

  private async publishToRelay(relayUrl: string, event: NostrEvent) {
    const socket = new WebSocket(relayUrl);
    await waitForSocketOpen(socket);

    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        socket.close();
        reject(new Error(`Relay publish timed out: ${relayUrl}`));
      }, 7000);

      const cleanup = () => {
        clearTimeout(timeoutId);
        socket.removeEventListener('message', handleMessage);
        socket.removeEventListener('error', handleError);
      };

      const handleError = () => {
        cleanup();
        socket.close();
        reject(new Error(`Relay publish failed: ${relayUrl}`));
      };

      const handleMessage = (message: WebSocketMessageEvent) => {
        const payload = JSON.parse(String(message.data)) as unknown[];
        if (!Array.isArray(payload) || payload.length < 2) {
          return;
        }
        if (payload[0] === 'OK' && payload[1] === event.id) {
          cleanup();
          socket.close();
          if (payload[2] === true) {
            resolve();
            return;
          }
          reject(
            new Error(
              typeof payload[3] === 'string'
                ? payload[3]
                : 'Relay rejected backup.',
            ),
          );
        }
      };

      socket.addEventListener('message', handleMessage);
      socket.addEventListener('error', handleError);
      socket.send(JSON.stringify(['EVENT', event]));
    });
  }

  private async fetchFromRelay(relayUrl: string, pubkey: string) {
    const socket = new WebSocket(relayUrl);
    await waitForSocketOpen(socket);

    return new Promise<RelayFetchCandidate | null>((resolve, reject) => {
      const requestId = `pearlift-${Date.now().toString(36)}`;
      let latestEvent: NostrEvent | null = null;
      const timeoutId = setTimeout(() => {
        cleanup();
        socket.close();
        if (latestEvent) {
          resolve({ relayUrl, event: latestEvent });
          return;
        }
        reject(new Error(`Relay fetch timed out: ${relayUrl}`));
      }, 7000);

      const cleanup = () => {
        clearTimeout(timeoutId);
        socket.removeEventListener('message', handleMessage);
        socket.removeEventListener('error', handleError);
      };

      const handleError = () => {
        cleanup();
        socket.close();
        reject(new Error(`Relay fetch failed: ${relayUrl}`));
      };

      const handleMessage = (message: WebSocketMessageEvent) => {
        const payload = JSON.parse(String(message.data)) as unknown[];
        if (!Array.isArray(payload) || payload.length < 2) {
          return;
        }
        if (payload[0] === 'EVENT' && payload[1] === requestId && payload[2]) {
          latestEvent = payload[2] as NostrEvent;
          return;
        }
        if (payload[0] === 'EOSE' && payload[1] === requestId) {
          cleanup();
          socket.send(JSON.stringify(['CLOSE', requestId]));
          socket.close();
          resolve(latestEvent ? { relayUrl, event: latestEvent } : null);
        }
      };

      socket.addEventListener('message', handleMessage);
      socket.addEventListener('error', handleError);
      socket.send(
        JSON.stringify([
          'REQ',
          requestId,
          {
            kinds: [PEARLIFT_BACKUP_KIND],
            authors: [pubkey],
            '#d': ['pearlift-backup'],
            limit: 20,
          },
        ]),
      );
    });
  }
}
