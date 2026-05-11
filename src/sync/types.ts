import type {
  MutationContext,
  SyncConflictSummary,
  SyncDataSummary,
  SyncRole,
  WorkoutMutation,
  WorkoutStoreSnapshot,
} from '@/storage/types';
import type { PearLiftRuntimeState } from '@/backup/types';

export const SYNC_OP_SCHEMA_VERSION = 1 as const;

export type SyncMutation = Extract<
  WorkoutMutation,
  | { type: 'setExerciseWeight' }
  | { type: 'addExercise' }
  | { type: 'editExercise' }
  | { type: 'deleteExercise' }
  | { type: 'reorderExercises' }
  | { type: 'replaceWeekConfigs' }
  | { type: 'replaceDayConfigs' }
>;

export interface SyncPresencePayload {
  kind: 'presence';
}

export interface SyncMutationPayload {
  kind: 'mutation';
  mutation: SyncMutation;
}

export interface SyncSnapshotReplacePayload {
  kind: 'snapshot_replace';
  runtime: PearLiftRuntimeState;
  summary: SyncDataSummary;
}

export interface SyncDeviceProfile {
  deviceId: string;
  displayName: string;
  writerKey?: string | null;
}

export interface SyncDeviceProfilePayload {
  kind: 'device_profile';
  profile: SyncDeviceProfile;
}

export type SyncPayload =
  | SyncMutationPayload
  | SyncPresencePayload
  | SyncSnapshotReplacePayload
  | SyncDeviceProfilePayload;

export interface SyncOpEnvelope {
  schemaVersion: typeof SYNC_OP_SCHEMA_VERSION;
  opId: string;
  deviceId: string;
  lamport: number;
  createdAt: string;
  payload?: SyncPayload;
  mutation?: SyncMutation;
}

export type SyncStatus =
  | 'idle'
  | 'connecting'
  | 'waiting'
  | 'dht_ready'
  | 'peer_connected'
  | 'handshake_ok'
  | 'replicating'
  | 'synced'
  | 'error';

export interface SyncHealth {
  status: SyncStatus;
  peers: number;
  connections: number;
  peerKeys: string[];
  localWriterKey: string | null;
  // Compatibility alias while consumers migrate to localWriterKey.
  localPublicKey: string | null;
  autobaseKey: string | null;
  topicHex: string | null;
  bootstrapped: boolean;
  reconnectAttempts: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export const INITIAL_SYNC_HEALTH: SyncHealth = {
  status: 'idle',
  peers: 0,
  connections: 0,
  peerKeys: [],
  localWriterKey: null,
  localPublicKey: null,
  autobaseKey: null,
  topicHex: null,
  bootstrapped: false,
  reconnectAttempts: 0,
  lastSyncedAt: null,
  lastError: null,
};

export interface StartSyncInput {
  pairingSecretHex: string;
  deviceId: string;
  role: SyncRole;
  bootstrapKeyHex?: string | null;
  debug?: {
    discoveryOnly?: boolean;
    disableCursorOptimization?: boolean;
  };
}

export interface FirstSyncState {
  role: SyncRole | null;
  state:
    | 'idle'
    | 'pending_first_sync'
    | 'waiting_for_remote'
    | 'conflict_requires_decision'
    | 'active_conflict_requires_decision'
    | 'active';
  localSummary: SyncDataSummary | null;
  remoteSummary: SyncDataSummary | null;
  conflictSummary: SyncConflictSummary | null;
}

export interface SyncBridge {
  start(input: StartSyncInput): Promise<{ bootstrapKeyHex: string }>;
  stop(): Promise<void>;
  clearStorage(): Promise<void>;
  publish(op: SyncOpEnvelope): Promise<void>;
  onRemoteOp(cb: (op: SyncOpEnvelope) => void): () => void;
  onStatus(cb: (health: SyncHealth) => void): () => void;
  pullLogs?(): Promise<SyncBridgeLogEntry[]>;
}

export interface SyncBridgeLogEntry {
  ts: number;
  deviceTag: string;
  level: 'info' | 'warn' | 'error';
  scope: string;
  key: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface SyncManager {
  start(input: {
    role: SyncRole;
    pairingSecretHex?: string;
    bootstrapKeyHex?: string;
    localSnapshot: WorkoutStoreSnapshot | null;
  }): Promise<void>;
  stop(): Promise<void>;
  publishLocalMutation(
    mutation: WorkoutMutation,
    snapshot: WorkoutStoreSnapshot | null,
  ): Promise<void>;
  handleRemoteOp(op: SyncOpEnvelope): Promise<void>;
  getHealth(): SyncHealth;
  onHealth(cb: (health: SyncHealth) => void): () => void;
  onRemoteApplied(cb: () => void): () => void;
  onStateChanged(cb: () => void): () => void;
  resolveFirstSyncChoice(choice: 'local' | 'remote'): Promise<void>;
  publishDeviceProfile(displayName: string): Promise<void>;
  leaveRoom(): Promise<void>;
  isActive(): boolean;
  getAllLogs(): Promise<SyncBridgeLogEntry[]>;
}

export const REMOTE_MUTATION_CONTEXT_BASE: Omit<
  MutationContext,
  'opId' | 'deviceId' | 'lamport'
> = {
  origin: 'remote',
  suppressSyncEmit: true,
};

export function isSyncableMutation(
  mutation: WorkoutMutation,
): mutation is
  | SyncMutation
  | { type: 'adjustExerciseWeight'; exerciseId: string; delta: number } {
  switch (mutation.type) {
    case 'setExerciseWeight':
    case 'adjustExerciseWeight':
    case 'addExercise':
    case 'editExercise':
    case 'deleteExercise':
    case 'reorderExercises':
    case 'replaceWeekConfigs':
    case 'replaceDayConfigs':
      return true;
    default:
      return false;
  }
}
