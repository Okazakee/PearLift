import { useCallback, useEffect, useState } from 'react';
import { SyncCoordinator } from '../sync/syncCoordinator';
import type { WorkoutMutation, WorkoutStoreSnapshot } from './types';
import type { WorkoutRepository } from './workoutRepository';

interface UseWorkoutStoreResult {
  snapshot: WorkoutStoreSnapshot | null;
  syncCoordinator: SyncCoordinator | null;
  isReady: boolean;
  reload: () => Promise<void>;
  applyMutation: (mutation: WorkoutMutation) => Promise<void>;
}

export function useWorkoutStore(
  repository: WorkoutRepository | null,
): UseWorkoutStoreResult {
  const [snapshot, setSnapshot] = useState<WorkoutStoreSnapshot | null>(null);
  const [syncCoordinator, setSyncCoordinator] =
    useState<SyncCoordinator | null>(null);
  const [isReady, setIsReady] = useState(false);

  const reload = useCallback(async () => {
    if (!repository) {
      return;
    }
    const next = await repository.getSnapshot();
    setSnapshot(next);
  }, [repository]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!repository) {
        return;
      }
      setIsReady(false);
      await repository.initialize();
      const next = await repository.getSnapshot();
      if (cancelled) {
        return;
      }
      setSnapshot(next);
      setSyncCoordinator(new SyncCoordinator(repository));
      setIsReady(true);
    }

    hydrate().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[workout-store/hydrate failed]', error);
    });

    return () => {
      cancelled = true;
    };
  }, [repository]);

  const applyMutation = useCallback(
    async (mutation: WorkoutMutation) => {
      if (!repository) {
        return;
      }
      await repository.applyMutation(mutation);
      const next = await repository.getSnapshot();
      setSnapshot(next);
    },
    [repository],
  );

  return {
    snapshot,
    syncCoordinator,
    isReady,
    reload,
    applyMutation,
  };
}
