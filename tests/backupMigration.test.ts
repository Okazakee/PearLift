import { describe, expect, test } from 'bun:test';
import { parseAndMigrateBackup, parseBackupJson } from '@/backup/migration';

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

describe('backup migration', () => {
  test('rejects invalid backup payloads early', () => {
    expectThrowMessage(() => parseBackupJson('{'), 'Invalid JSON file.');
    expectThrowMessage(
      () => parseBackupJson(JSON.stringify({ version: 2 })),
      'Unsupported backup version.',
    );
  });

  test('normalizes malformed runtime fields while preserving valid data', () => {
    const raw = JSON.stringify({
      version: 3,
      exportedAt: '2026-01-02T03:04:05.000Z',
      data: {
        workouts: [
          {
            id: 'day1',
            name: 'Push',
            description: 'Normalized',
            exercises: [
              {
                id: 'bench',
                name: 'Bench Press',
                sets: 3,
                reps: '8',
                baseWeight: 40,
                muscleGroup: 'Chest',
                notes: 'Stable',
                position: 2,
              },
              {
                id: 'row',
                name: 'Row',
                sets: 4,
                reps: '10',
                baseWeight: 30,
                muscleGroup: 'Back',
                position: 0,
              },
            ],
          },
        ],
        userWeights: {
          bench: 42.5,
          row: 32.5,
        },
        weekConfigs: [{ id: 1, name: 'Only Week', loadModifier: 1.05, rir: 1 }],
        dayConfigs: [
          { id: 'day1', name: 'Push', icon: 'Activity' },
          { id: 'day1', name: 'Duplicate Push', icon: 'Repeat' },
        ],
        settings: {
          currentWeek: 99,
          currentDay: 'missing-day',
          restDuration: 'bad-number',
          themeMode: 'bogus',
          weightUnit: 'bogus',
          language: '',
        },
      },
    });

    const migrated = parseAndMigrateBackup(raw);

    expect(migrated.backup.exportedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(
      migrated.runtime.workouts[0]?.exercises.map((item) => item.id),
    ).toEqual(['row', 'bench']);
    expect(migrated.runtime.currentWeek).toBe(1);
    expect(migrated.runtime.currentDay).toBe('day1');
    expect(migrated.runtime.restDuration).toBe(150);
    expect(migrated.runtime.themeMode).toBe('system');
    expect(migrated.runtime.weightUnit).toBe('kg');
    expect(migrated.runtime.language).toBe('system');
    expect(migrated.runtime.dayConfigs).toEqual([
      { id: 'day1', name: 'Push', icon: 'Activity' },
    ]);
    expect(migrated.runtime.userWeights).toEqual({
      bench: 42.5,
      row: 32.5,
    });
  });
});
