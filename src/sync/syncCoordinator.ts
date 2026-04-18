import { parseAndMigrateBackup, toPwaBackupV2 } from '../backup/localBackup';
import type {
  MigratedBackupResult,
  PearLiftRuntimeState,
} from '../backup/types';
import type {
  AppSetupState,
  SetupRecoverySource,
  SyncMode,
} from '../storage/types';
import type { WorkoutRepository } from '../storage/workoutRepository';
import { BackupCodec } from './backupCodec';
import { PEARLIFT_RELAY_URLS } from './constants';
import { IdentityService } from './identityService';
import { NostrBackupService } from './nostrBackupService';
import type {
  BackupPublishResult,
  BackupRestoreResult,
  SetupCompletionResult,
  SetupStatus,
  SyncStatus,
} from './types';

class PlaceholderPeerSyncService {
  async startSession() {
    throw new Error(
      'Peer sync is planned for phase 2 and is not implemented yet.',
    );
  }

  async syncWithPeer() {
    throw new Error(
      'Peer sync is planned for phase 2 and is not implemented yet.',
    );
  }
}

function isRelayEnabled(syncMode: SyncMode) {
  return syncMode !== 'local-only';
}

export class SyncCoordinator {
  private readonly codec = new BackupCodec();
  private readonly identityService = new IdentityService();
  private readonly nostrSync = new NostrBackupService(
    this.codec,
    PEARLIFT_RELAY_URLS,
  );
  private readonly peerSync = new PlaceholderPeerSyncService();

  constructor(private readonly repository: WorkoutRepository) {}

  async completeSetup(
    syncMode: SyncMode,
    recoverySource: SetupRecoverySource = 'start-fresh',
  ): Promise<SetupCompletionResult> {
    const identity = await this.identityService.provisionIdentity();
    await this.repository.completeSetup({
      syncMode,
      identityProvisionedAt: identity.provisionedAt,
      hasSeenRecoveryOptions: true,
      recoverySource,
    });

    return {
      syncMode,
      identityProvisionedAt: identity.provisionedAt,
      recoverySource,
    };
  }

  async updateSyncMode(syncMode: SyncMode) {
    const setup = await this.repository.getSetupState();
    await this.repository.completeSetup({
      syncMode,
      identityProvisionedAt:
        setup.identityProvisionedAt ?? new Date().toISOString(),
      hasSeenRecoveryOptions: setup.hasSeenRecoveryOptions,
      recoverySource: setup.recoverySource,
    });
  }

  async getSetupStatus(): Promise<SetupStatus> {
    const [setup, identity] = await Promise.all([
      this.repository.getSetupState(),
      this.identityService.loadProvisionedIdentity(),
    ]);

    return {
      setup,
      identityReady: Boolean(identity),
      identityFingerprint: identity?.masterFingerprint ?? null,
    };
  }

  async getStatus(): Promise<SyncStatus> {
    const [identity, snapshot, pendingChanges, setup] = await Promise.all([
      this.identityService.loadProvisionedIdentity(),
      this.repository.getSnapshot(),
      this.repository.getPendingChangesCount(),
      this.repository.getSetupState(),
    ]);

    return {
      syncMode: setup.syncMode,
      identityReady: Boolean(identity?.nostrPubkey),
      lastBackupAt: snapshot.checkpoint.lastBackupAt,
      lastBackupEventId: snapshot.checkpoint.lastBackupEventId,
      lastBackupRevision: snapshot.checkpoint.lastBackupRevision,
      lastRestoreAt: snapshot.checkpoint.lastRestoreAt,
      pendingChanges,
      relayUrls: [...PEARLIFT_RELAY_URLS],
    };
  }

  async backupNow(): Promise<BackupPublishResult> {
    const [identity, setup, snapshot] = await Promise.all([
      this.identityService.loadProvisionedIdentity(),
      this.repository.getSetupState(),
      this.repository.getSnapshot(),
    ]);

    if (!isRelayEnabled(setup.syncMode)) {
      throw new Error('Relay backup is disabled in Local-only mode.');
    }
    if (!identity) {
      throw new Error('Identity is not provisioned yet.');
    }

    const backup = toPwaBackupV2(snapshot);
    const published = await this.nostrSync.publishBackup({
      identity,
      backup,
      snapshotVersion: snapshot.checkpoint.localRevision,
    });
    await this.repository.setBackupCheckpoint({
      lastBackupAt: published.createdAt,
      lastBackupEventId: published.eventId,
      lastBackupRevision: published.snapshotVersion,
    });
    return published;
  }

  async restoreLatestIfEnabled(): Promise<BackupRestoreResult> {
    const setup = await this.repository.getSetupState();
    if (!isRelayEnabled(setup.syncMode)) {
      throw new Error('Relay restore is disabled in Local-only mode.');
    }
    return this.restoreLatest();
  }

  async restoreLatest(): Promise<BackupRestoreResult> {
    const identity = await this.identityService.loadProvisionedIdentity();
    if (!identity) {
      throw new Error('Identity is not provisioned yet.');
    }

    const restored = await this.nostrSync.fetchLatestBackup(identity);
    const migrated = parseAndMigrateBackup(JSON.stringify(restored.backup));
    await this.repository.applyMutation({
      type: 'restoreRuntimeState',
      runtime: migrated.runtime,
      source: 'local-import',
    });
    await this.repository.setBackupCheckpoint({
      lastBackupAt: restored.createdAt,
      lastBackupEventId: restored.eventId,
      lastBackupRevision: restored.snapshotVersion,
    });
    return restored;
  }

  async restoreImportedRuntime(runtime: PearLiftRuntimeState) {
    await this.repository.applyMutation({
      type: 'restoreRuntimeState',
      runtime,
      source: 'local-import',
    });
  }

  async markRecoverySeen(setup: AppSetupState) {
    await this.repository.completeSetup({
      syncMode: setup.syncMode,
      identityProvisionedAt:
        setup.identityProvisionedAt ?? new Date().toISOString(),
      hasSeenRecoveryOptions: true,
      recoverySource: setup.recoverySource,
    });
  }

  async syncNearbyDevice() {
    return this.peerSync.startSession();
  }

  async previewImport(rawJson: string): Promise<MigratedBackupResult> {
    return parseAndMigrateBackup(rawJson);
  }
}
