import type { WorkoutRepository } from '@/storage';
import { createWorkoutRepository } from '@/storage';
import { createSyncManager } from '@/sync/syncManager';
import type { SyncManager } from '@/sync/types';

interface WorkoutRuntime {
  repository: WorkoutRepository;
  syncManager: SyncManager;
}

let runtime: WorkoutRuntime | null = null;
let initPromise: Promise<WorkoutRuntime> | null = null;

export async function ensureWorkoutRuntime(): Promise<WorkoutRuntime> {
  if (runtime) {
    return runtime;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const repository = createWorkoutRepository();
    await repository.initialize();
    const syncManager = createSyncManager(repository);
    runtime = {
      repository,
      syncManager,
    };
    return runtime;
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

export function getWorkoutRuntime(): WorkoutRuntime {
  if (!runtime) {
    throw new Error('Workout runtime is not initialized.');
  }
  return runtime;
}
