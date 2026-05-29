import { describe, expect, test } from 'bun:test';
import { parseAndMigrateBackup } from '@/backup/migration';
import {
  assembleChunkedPackets,
  decodeQrPayload,
  encodeBackupForQr,
} from '@/backup/qrBackupCodec';
import type { PearLiftRuntimeState } from '@/backup/types';
import { buildDefaultRuntimeState } from '@/storage/repository/defaults';

function buildSmallRuntime(): PearLiftRuntimeState {
  return {
    workouts: [
      {
        id: 'day1',
        name: 'Day 1',
        description: 'Minimal',
        exercises: [
          {
            id: 'exercise-1',
            name: 'Bench Press',
            sets: 3,
            reps: '8',
            baseWeight: 20,
            muscleGroup: 'Chest',
            notes: '',
            position: 0,
          },
        ],
      },
    ],
    userWeights: { 'exercise-1': 20 },
    weekConfigs: [{ id: 1, name: 'Week 1', loadModifier: 1, rir: 2 }],
    dayConfigs: [{ id: 'day1', name: 'Day 1', icon: 'Activity' }],
    currentWeek: 1,
    currentDay: 'day1',
    restDuration: 150,
    themeMode: 'system',
    weightUnit: 'kg',
    language: 'system',
  };
}

function buildLargeRuntime(): PearLiftRuntimeState {
  const state = buildDefaultRuntimeState();
  return {
    ...state,
    workouts: state.workouts.map((workout, workoutIndex) => ({
      ...workout,
      exercises: workout.exercises.map((exercise, exerciseIndex) => ({
        ...exercise,
        notes: `Chunk payload ${workout.id}-${exerciseIndex} `.repeat(400),
        name: `${exercise.name} ${String(workoutIndex + 1).repeat(60)}`,
      })),
    })),
  };
}

function expectThrowMessage(fn: () => void, message: string) {
  let caught: unknown = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }

  expect(caught instanceof Error ? caught.message : String(caught)).toBe(
    message,
  );
}

describe('QR backup codec', () => {
  test('keeps small payloads in a single QR envelope', () => {
    const encoded = encodeBackupForQr(buildSmallRuntime());

    expect(encoded.mode).toBe('single');
    expect(encoded.packets.length).toBe(1);

    const decoded = decodeQrPayload(encoded.packets[0] ?? '');
    expect(decoded.kind).toBe('single');
    if (decoded.kind === 'single') {
      expect(decoded.checksum).toBe(encoded.checksum);
    }
  });

  test('round-trips large payloads through chunk assembly', () => {
    const runtime = buildLargeRuntime();
    const encoded = encodeBackupForQr(runtime);

    expect(encoded.mode).toBe('chunked');
    expect(encoded.packets.length).toBeGreaterThan(1);

    const packets = new Map<number, string>();
    for (const packet of encoded.packets) {
      const decoded = decodeQrPayload(packet);
      expect(decoded.kind).toBe('chunk');
      if (decoded.kind === 'chunk') {
        packets.set(decoded.index, decoded.payload);
      }
    }

    const jsonText = assembleChunkedPackets(
      packets,
      encoded.packets.length,
      encoded.checksum,
    );
    const migrated = parseAndMigrateBackup(jsonText);

    expect(migrated.runtime.workouts.length).toBe(runtime.workouts.length);
    expect(
      migrated.runtime.workouts[0]?.exercises[0]?.notes.includes(
        'Chunk payload',
      ),
    ).toBe(true);
    expect(migrated.runtime.language).toBe(runtime.language);
  });

  test('returns raw payloads and rejects incomplete chunk maps', () => {
    expect(decodeQrPayload('plain-text-backup')).toEqual({
      kind: 'raw',
      payload: 'plain-text-backup',
    });

    expectThrowMessage(
      () => assembleChunkedPackets(new Map([[0, 'abc']]), 2, 'deadbeef'),
      'Missing QR chunks.',
    );
  });
});
