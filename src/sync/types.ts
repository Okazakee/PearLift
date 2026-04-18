import type { PwaBackupV2 } from '../backup/types';
import type {
  AppSetupState,
  SetupRecoverySource,
  SyncMode,
} from '../storage/types';

export interface SyncIdentity {
  deviceId: string;
  masterFingerprint: string;
  nostrPubkey: string;
  masterSeedHex: string;
  nostrSecretKeyHex: string;
  backupKeyHex: string;
  holepunchMasterKeyHex: string;
  holepunchStaticKeyHex: string;
  holepunchPeerId: string;
  provisionedAt: string;
}

export interface EncryptedBackupEnvelope {
  schemaVersion: number;
  createdAt: string;
  deviceId: string;
  snapshotVersion: number;
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface RelayBackupSnapshot {
  snapshotVersion: number;
  backup: PwaBackupV2;
}

export interface BackupPublishResult {
  eventId: string;
  relayUrls: string[];
  createdAt: string;
  snapshotVersion: number;
}

export interface BackupRestoreResult {
  relayUrl: string;
  eventId: string;
  createdAt: string;
  snapshotVersion: number;
  backup: PwaBackupV2;
}

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface SyncStatus {
  syncMode: SyncMode;
  identityReady: boolean;
  lastBackupAt: string | null;
  lastBackupEventId: string | null;
  lastBackupRevision: number;
  lastRestoreAt: string | null;
  pendingChanges: number;
  relayUrls: string[];
}

export interface PeerSyncSession {
  peerId: string;
  openedAt: string;
}

export interface PeerSyncService {
  startSession(): Promise<PeerSyncSession>;
  syncWithPeer(peerId: string): Promise<void>;
}

export interface SetupStatus {
  setup: AppSetupState;
  identityReady: boolean;
  identityFingerprint: string | null;
}

export interface SetupCompletionResult {
  syncMode: SyncMode;
  identityProvisionedAt: string;
  recoverySource: SetupRecoverySource;
}
