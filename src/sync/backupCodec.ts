import { sha256 } from '@noble/hashes/sha2.js';
import * as secp from '@noble/secp256k1';
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  bytesToUtf8,
  hexToBytes,
  utf8ToBytes,
} from '../utils/encoding';
import { PEARLIFT_AAD, PEARLIFT_BACKUP_SCHEMA_VERSION } from './constants';
import type {
  EncryptedBackupEnvelope,
  RelayBackupSnapshot,
  SyncIdentity,
} from './types';

export class BackupCodec {
  async encryptSnapshot(
    identity: SyncIdentity,
    snapshot: RelayBackupSnapshot,
  ): Promise<EncryptedBackupEnvelope> {
    const payload = utf8ToBytes(JSON.stringify(snapshot));
    const key = await AESEncryptionKey.import(identity.backupKeyHex, 'hex');
    const sealed = await aesEncryptAsync(payload, key, {
      additionalData: utf8ToBytes(PEARLIFT_AAD),
    });

    const [ciphertext, iv, tag] = await Promise.all([
      sealed.ciphertext({ includeTag: false, encoding: 'base64' }),
      sealed.iv('base64'),
      sealed.tag('base64'),
    ]);

    return {
      schemaVersion: PEARLIFT_BACKUP_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      deviceId: identity.deviceId,
      snapshotVersion: snapshot.snapshotVersion,
      ciphertext,
      iv,
      tag,
    };
  }

  async decryptEnvelope(
    identity: SyncIdentity,
    envelope: EncryptedBackupEnvelope,
  ): Promise<RelayBackupSnapshot> {
    if (envelope.schemaVersion !== PEARLIFT_BACKUP_SCHEMA_VERSION) {
      throw new Error('Unsupported backup schema version.');
    }

    const key = await AESEncryptionKey.import(identity.backupKeyHex, 'hex');
    const sealed = AESSealedData.fromParts(
      envelope.iv,
      envelope.ciphertext,
      envelope.tag,
    );
    const plaintext = await aesDecryptAsync(sealed, key, {
      additionalData: utf8ToBytes(PEARLIFT_AAD),
      output: 'bytes',
    });
    const decoded = JSON.parse(bytesToUtf8(plaintext)) as RelayBackupSnapshot;
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      typeof decoded.snapshotVersion !== 'number' ||
      !decoded.backup
    ) {
      throw new Error('Invalid backup payload.');
    }
    return decoded;
  }

  serializeEvent(event: {
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
  }) {
    return JSON.stringify([
      0,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content,
    ]);
  }

  async createSignedEvent(
    identity: SyncIdentity,
    input: {
      kind: number;
      tags: string[][];
      content: string;
      createdAt?: Date;
    },
  ) {
    const created_at = Math.floor(
      (input.createdAt ?? new Date()).getTime() / 1000,
    );
    const unsignedEvent = {
      pubkey: identity.nostrPubkey,
      created_at,
      kind: input.kind,
      tags: input.tags,
      content: input.content,
    };
    const idBytes = sha256(utf8ToBytes(this.serializeEvent(unsignedEvent)));
    const id = bytesToHex(idBytes);
    const signature = await secp.schnorr.signAsync(
      hexToBytes(id),
      hexToBytes(identity.nostrSecretKeyHex),
    );
    return {
      id,
      sig: bytesToHex(signature),
      ...unsignedEvent,
    };
  }

  async verifyEventSignature(event: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
  }) {
    const recomputedId = bytesToHex(
      sha256(utf8ToBytes(this.serializeEvent(event))),
    );
    if (recomputedId !== event.id) {
      return false;
    }
    return secp.schnorr.verifyAsync(
      hexToBytes(event.sig),
      hexToBytes(event.id),
      hexToBytes(event.pubkey),
    );
  }

  encodeEnvelope(envelope: EncryptedBackupEnvelope) {
    return JSON.stringify(envelope);
  }

  decodeEnvelope(content: string): EncryptedBackupEnvelope {
    const parsed = JSON.parse(content) as EncryptedBackupEnvelope;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.schemaVersion !== 'number' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.deviceId !== 'string' ||
      typeof parsed.snapshotVersion !== 'number' ||
      typeof parsed.ciphertext !== 'string' ||
      typeof parsed.iv !== 'string' ||
      typeof parsed.tag !== 'string'
    ) {
      throw new Error('Invalid encrypted backup envelope.');
    }
    return parsed;
  }

  encodeRelayCursor(pubkey: string, createdAt: string) {
    return bytesToBase64(utf8ToBytes(`${pubkey}:${createdAt}`));
  }

  decodeRelayCursor(cursor: string) {
    return bytesToUtf8(base64ToBytes(cursor));
  }
}
