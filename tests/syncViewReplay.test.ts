import { describe, expect, test } from 'bun:test';
import type { PearLiftRuntimeState } from '@/backup/types';
import { defaultDayConfigs, defaultWeekConfigs } from '@/data/workouts';
import { summarizeRuntime } from '@/sync/firstSync';
import { preserveLocalPreferences } from '@/sync/manager/state';
import type { SyncOpEnvelope } from '@/sync/types';
import { SYNC_OP_SCHEMA_VERSION } from '@/sync/types';
import { buildSyncViewProjection } from '@/sync/viewReplay';

function runtimeWithLocalPreferences(): PearLiftRuntimeState {
  return {
    workouts: [
      {
        id: 'day1',
        name: 'Day 1',
        description: 'Push',
        exercises: [
          {
            id: 'exercise-1',
            name: 'Bench Press',
            sets: 3,
            reps: '8',
            baseWeight: 80,
            muscleGroup: 'Chest',
            notes: '',
            position: 0,
          },
        ],
      },
    ],
    userWeights: {
      'exercise-1': 82.5,
    },
    weekConfigs: defaultWeekConfigs,
    dayConfigs: defaultDayConfigs,
    currentWeek: 3,
    currentDay: defaultDayConfigs[1]?.id ?? 'day2',
    restDuration: 210,
    themeMode: 'dark',
    weightUnit: 'lb',
    language: 'it',
  };
}

function weightOp(
  opId: string,
  lamport: number,
  value: number,
): SyncOpEnvelope {
  return {
    schemaVersion: SYNC_OP_SCHEMA_VERSION,
    opId,
    deviceId: 'device-a',
    lamport,
    createdAt: `2026-06-12T10:00:0${lamport}.000Z`,
    payload: {
      kind: 'mutation',
      mutation: {
        type: 'setExerciseWeight',
        exerciseId: 'exercise-1',
        value,
      },
    },
  };
}

function snapshotOp(runtime: PearLiftRuntimeState): SyncOpEnvelope {
  return {
    schemaVersion: SYNC_OP_SCHEMA_VERSION,
    opId: 'device-a:0',
    deviceId: 'device-a',
    lamport: 0,
    createdAt: '2026-06-12T10:00:00.000Z',
    payload: {
      kind: 'snapshot_replace',
      runtime,
      summary: summarizeRuntime(runtime),
    },
  };
}

function reconcileOrderedView(
  localRuntime: PearLiftRuntimeState,
  ops: SyncOpEnvelope[],
): PearLiftRuntimeState {
  const projection = buildSyncViewProjection(ops);
  return preserveLocalPreferences(projection.runtime, localRuntime);
}

describe('sync view replay', () => {
  test('reordered last-write-wins ops converge to the current ordered view', () => {
    const localRuntime = runtimeWithLocalPreferences();
    const baseline = snapshotOp(localRuntime);
    const opA = weightOp('device-a:1', 1, 80);
    const opB = weightOp('device-a:2', 2, 85);

    const afterInitialView = reconcileOrderedView(localRuntime, [
      baseline,
      opA,
      opB,
    ]);
    const afterReorderedView = reconcileOrderedView(afterInitialView, [
      baseline,
      opB,
      opA,
    ]);
    const fromScratchReorderedView = reconcileOrderedView(localRuntime, [
      baseline,
      opB,
      opA,
    ]);

    expect(afterInitialView.userWeights['exercise-1']).toBe(85);
    expect(afterReorderedView.userWeights['exercise-1']).toBe(80);
    expect(fromScratchReorderedView.userWeights['exercise-1']).toBe(80);
    expect(summarizeRuntime(afterReorderedView).syncFingerprint).toBe(
      summarizeRuntime(fromScratchReorderedView).syncFingerprint,
    );
    expect(afterReorderedView.themeMode).toBe(localRuntime.themeMode);
    expect(afterReorderedView.weightUnit).toBe(localRuntime.weightUnit);
    expect(afterReorderedView.language).toBe(localRuntime.language);
    expect(afterReorderedView.restDuration).toBe(localRuntime.restDuration);
  });
});
