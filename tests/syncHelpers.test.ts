import { describe, expect, test } from 'bun:test';
import { defaultDayConfigs, defaultWeekConfigs } from '@/data/workouts';
import type { WorkoutStoreSnapshot } from '@/storage/types';
import { canonicalizeMutationForSync } from '@/sync/canonicalize';
import { coalescePublishQueue } from '@/sync/coalesce';
import {
  isHealthyReconnectState,
  shouldBufferDuringActiveConflict,
  shouldBufferDuringJoin,
} from '@/sync/manager/remoteApply';
import { SYNC_OP_SCHEMA_VERSION, type SyncMutation } from '@/sync/types';

const baseSnapshot: WorkoutStoreSnapshot = {
  workouts: [],
  userWeights: {
    bench: 82.5,
  },
  weekConfigs: defaultWeekConfigs,
  dayConfigs: defaultDayConfigs,
  currentWeek: 1,
  currentDay: defaultDayConfigs[0]?.id ?? 'push',
  restDuration: 150,
  themeMode: 'system',
  weightUnit: 'kg',
  language: 'system',
  isSetupDone: true,
};

describe('canonicalizeMutationForSync', () => {
  test('converts adjustExerciseWeight into a setExerciseWeight mutation', () => {
    expect(
      canonicalizeMutationForSync(
        {
          type: 'adjustExerciseWeight',
          exerciseId: 'bench',
          delta: 2.5,
        },
        baseSnapshot,
      ),
    ).toEqual({
      type: 'setExerciseWeight',
      exerciseId: 'bench',
      value: 82.5,
    });
  });

  test('returns null for non-syncable mutations', () => {
    expect(
      canonicalizeMutationForSync(
        { type: 'setCurrentWeek', currentWeek: 2 },
        baseSnapshot,
      ),
    ).toBeNull();
  });
});

describe('coalescePublishQueue', () => {
  test('replaces prior exercise weight writes for the same exercise', () => {
    const queue: SyncMutation[] = [
      { type: 'setExerciseWeight', exerciseId: 'bench', value: 80 },
      { type: 'setExerciseWeight', exerciseId: 'row', value: 60 },
    ];

    expect(
      coalescePublishQueue(queue, {
        type: 'setExerciseWeight',
        exerciseId: 'bench',
        value: 85,
      }),
    ).toEqual([
      { type: 'setExerciseWeight', exerciseId: 'row', value: 60 },
      { type: 'setExerciseWeight', exerciseId: 'bench', value: 85 },
    ]);
  });

  test('replaces prior replaceWeekConfigs mutations', () => {
    const queue: SyncMutation[] = [
      {
        type: 'replaceWeekConfigs',
        weekConfigs: [{ id: 1, name: 'W1', loadModifier: 1, rir: 2 }],
      },
      {
        type: 'addExercise',
        workoutId: 'push',
        exercise: {
          name: 'Bench',
          sets: 3,
          reps: '8',
          muscleGroup: 'Chest',
          notes: '',
        },
      },
    ];

    expect(
      coalescePublishQueue(queue, {
        type: 'replaceWeekConfigs',
        weekConfigs: [{ id: 1, name: 'W1b', loadModifier: 0.9, rir: 3 }],
      }),
    ).toEqual([
      {
        type: 'addExercise',
        workoutId: 'push',
        exercise: {
          name: 'Bench',
          sets: 3,
          reps: '8',
          muscleGroup: 'Chest',
          notes: '',
        },
      },
      {
        type: 'replaceWeekConfigs',
        weekConfigs: [{ id: 1, name: 'W1b', loadModifier: 0.9, rir: 3 }],
      },
    ]);
  });

  test('replaces prior reorder mutations for the same workout', () => {
    const queue: SyncMutation[] = [
      {
        type: 'reorderExercises',
        workoutId: 'push',
        orderedExerciseIds: ['exercise-1', 'exercise-2'],
      },
      {
        type: 'setExerciseWeight',
        exerciseId: 'row',
        value: 60,
      },
    ];

    expect(
      coalescePublishQueue(queue, {
        type: 'reorderExercises',
        workoutId: 'push',
        orderedExerciseIds: ['exercise-2', 'exercise-1'],
      }),
    ).toEqual([
      {
        type: 'setExerciseWeight',
        exerciseId: 'row',
        value: 60,
      },
      {
        type: 'reorderExercises',
        workoutId: 'push',
        orderedExerciseIds: ['exercise-2', 'exercise-1'],
      },
    ]);
  });
});

describe('remote apply helpers', () => {
  const weightOp = {
    schemaVersion: SYNC_OP_SCHEMA_VERSION,
    opId: 'op-weight',
    deviceId: 'device-a',
    lamport: 1,
    createdAt: '2026-05-29T10:00:00.000Z',
    mutation: {
      type: 'setExerciseWeight',
      exerciseId: 'bench',
      value: 85,
    } as const,
  };

  const presenceOp = {
    schemaVersion: SYNC_OP_SCHEMA_VERSION,
    opId: 'op-presence',
    deviceId: 'device-a',
    lamport: 2,
    createdAt: '2026-05-29T10:00:01.000Z',
    payload: {
      kind: 'presence',
    } as const,
  };

  const deviceProfileOp = {
    schemaVersion: SYNC_OP_SCHEMA_VERSION,
    opId: 'op-profile',
    deviceId: 'device-a',
    lamport: 3,
    createdAt: '2026-05-29T10:00:02.000Z',
    payload: {
      kind: 'device_profile',
      profile: {
        deviceId: 'device-a',
        displayName: 'Creator',
        writerKey: 'writer-key',
      },
    } as const,
  };

  test('buffers non-presence ops while a joiner is awaiting first sync', () => {
    expect(
      shouldBufferDuringJoin(weightOp, 'joiner', 'pending_first_sync'),
    ).toBe(true);
    expect(
      shouldBufferDuringJoin(presenceOp, 'joiner', 'pending_first_sync'),
    ).toBe(false);
    expect(
      shouldBufferDuringJoin(deviceProfileOp, 'joiner', 'pending_first_sync'),
    ).toBe(false);
    expect(
      shouldBufferDuringJoin(weightOp, 'creator', 'pending_first_sync'),
    ).toBe(false);
  });

  test('buffers remote mutations during active conflict, but not device presence', () => {
    expect(
      shouldBufferDuringActiveConflict(
        weightOp,
        'active_conflict_requires_decision',
      ),
    ).toBe(true);
    expect(
      shouldBufferDuringActiveConflict(
        presenceOp,
        'active_conflict_requires_decision',
      ),
    ).toBe(false);
  });

  test('treats handshake_ok with no reconnect attempts as healthy', () => {
    expect(
      isHealthyReconnectState({
        status: 'handshake_ok',
        syncMode: 'normal',
        degradedReason: null,
        degradedSince: null,
        peers: 1,
        connections: 1,
        peerKeys: [],
        lastSyncedAt: null,
        lastError: null,
        localWriterKey: null,
        localPublicKey: null,
        autobaseKey: null,
        topicHex: null,
        bootstrapped: true,
        reconnectAttempts: 0,
      }),
    ).toBe(true);
    expect(
      isHealthyReconnectState({
        status: 'waiting',
        syncMode: 'normal',
        degradedReason: null,
        degradedSince: null,
        peers: 0,
        connections: 0,
        peerKeys: [],
        lastSyncedAt: null,
        lastError: null,
        localWriterKey: null,
        localPublicKey: null,
        autobaseKey: null,
        topicHex: null,
        bootstrapped: false,
        reconnectAttempts: 1,
      }),
    ).toBe(false);
  });
});
