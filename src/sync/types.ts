import type {
  MutationContext,
  WorkoutMutation,
  WorkoutStoreSnapshot,
} from '../storage/types';

export const SYNC_OP_SCHEMA_VERSION = 1 as const;

export type SyncMutation = Exclude<
  WorkoutMutation,
  | { type: 'adjustExerciseWeight' }
  | { type: 'resetAllData' }
  | { type: 'restoreRuntimeState' }
>;

export interface SyncOpEnvelope {
  schemaVersion: typeof SYNC_OP_SCHEMA_VERSION;
  opId: string;
  deviceId: string;
  lamport: number;
  createdAt: string;
  mutation: SyncMutation;
}

export type SyncStatus = 'idle' | 'connecting' | 'synced' | 'error';

export interface SyncHealth {
  status: SyncStatus;
  peers: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface StartSyncInput {
  pairingSecretHex: string;
  deviceId: string;
  bootstrapKeyHex?: string | null;
}

export interface SyncBridge {
  start(input: StartSyncInput): Promise<{ bootstrapKeyHex: string }>;
  stop(): Promise<void>;
  publish(op: SyncOpEnvelope): Promise<void>;
  onRemoteOp(cb: (op: SyncOpEnvelope) => void): () => void;
  onStatus(cb: (health: SyncHealth) => void): () => void;
}

export interface SyncManager {
  start(pairingSecretHex?: string): Promise<void>;
  stop(): Promise<void>;
  publishLocalMutation(
    mutation: WorkoutMutation,
    snapshot: WorkoutStoreSnapshot | null,
  ): Promise<void>;
  handleRemoteOp(op: SyncOpEnvelope): Promise<void>;
  getHealth(): SyncHealth;
  onHealth(cb: (health: SyncHealth) => void): () => void;
  isActive(): boolean;
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
  return (
    mutation.type !== 'resetAllData' && mutation.type !== 'restoreRuntimeState'
  );
}
