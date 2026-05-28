import type { PearLiftRuntimeState } from '@/backup/types';
import type { WorkoutRepository, WorkoutStoreSnapshot } from '@/storage';
import type { SyncDataSummary } from '@/storage/types';

export const EMPTY_ROOM_TIMEOUT_MS = 6000;
export const PENDING_RESOLVE_DEBOUNCE_MS = 1000;
export const PUBLISH_DEBOUNCE_MS = 200;
export const RECONNECT_RECONCILE_MS = 1500;
export const MAX_BUFFERED_REMOTE_OPS = 200;

export function nowIso(): string {
  return new Date().toISOString();
}

export function createOpId(deviceId: string, lamport: number): string {
  return `${deviceId}:${lamport}`;
}

export function summarizeRoomBindingState(
  state: Awaited<ReturnType<WorkoutRepository['getSyncState']>>,
) {
  return {
    roomBindingState: state.roomBindingState,
    firstSyncResolution: state.firstSyncResolution,
    autobaseBootstrapKey: state.autobaseBootstrapKey,
    hasPendingLocalSummary: Boolean(state.pendingLocalSummary),
    hasPendingRemoteSummary: Boolean(state.pendingRemoteSummary),
    hasPendingConflictSummary: Boolean(state.pendingConflictSummary),
  };
}

export function toRuntime(
  snapshot: WorkoutStoreSnapshot | PearLiftRuntimeState,
): PearLiftRuntimeState {
  return {
    workouts: snapshot.workouts,
    userWeights: snapshot.userWeights,
    weekConfigs: snapshot.weekConfigs,
    dayConfigs: snapshot.dayConfigs,
    currentWeek: snapshot.currentWeek,
    currentDay: snapshot.currentDay,
    restDuration: snapshot.restDuration,
    themeMode: snapshot.themeMode,
    weightUnit: snapshot.weightUnit,
    language: snapshot.language,
  } satisfies PearLiftRuntimeState;
}

export function preserveLocalPreferences(
  incoming: PearLiftRuntimeState,
  local: PearLiftRuntimeState,
): PearLiftRuntimeState {
  return {
    ...incoming,
    currentWeek: local.currentWeek,
    currentDay: local.currentDay,
    restDuration: local.restDuration,
    themeMode: local.themeMode,
    weightUnit: local.weightUnit,
    language: local.language,
  };
}

export function hasSummaryData(summary: SyncDataSummary | null): boolean {
  return Boolean(summary && summary.workoutCount > 0);
}

