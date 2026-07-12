import { describe, expect, test } from 'bun:test';
import {
  getDayDisplayInfo,
  getIsoWeekday,
  getSuggestedDayConfig,
  resolveSelectedDay,
  wasManualDaySelectedToday,
} from '@/utils/schedule';

describe('schedule helpers', () => {
  test('extracts session and schedule labels from a day config', () => {
    expect(
      getDayDisplayInfo({
        name: 'Push',
        sessionLabel: 'A',
        schedule: {
          type: 'fixed_day',
          preferredDay: 1,
          label: 'Mon',
        },
      }),
    ).toEqual({
      sessionLabel: 'A',
      title: 'Push',
      scheduleLabel: 'Mon',
      metaLabel: 'A · Mon',
    });
  });

  test('falls back to parsing the name when no explicit session label exists', () => {
    expect(
      getDayDisplayInfo({
        name: 'B, Back',
      }),
    ).toEqual({
      sessionLabel: 'B',
      title: 'Back',
      scheduleLabel: null,
      metaLabel: 'B',
    });
  });

  test('falls back to the raw day name when no session code exists', () => {
    expect(
      getDayDisplayInfo({
        name: 'Lower Body',
      }),
    ).toEqual({
      sessionLabel: null,
      title: 'Lower Body',
      scheduleLabel: null,
      metaLabel: null,
    });
  });

  test('maps sunday to ISO weekday 7', () => {
    expect(getIsoWeekday(new Date('2026-06-28T12:00:00.000Z'))).toBe(7);
  });

  test('returns the matching fixed day or window suggestion', () => {
    const dayConfigs = [
      {
        id: 'push',
        name: 'A, Push',
        icon: 'Activity',
        schedule: {
          type: 'fixed_day' as const,
          preferredDay: 1,
          label: 'Mon',
        },
      },
      {
        id: 'pull',
        name: 'B, Back',
        icon: 'Clock',
        schedule: {
          type: 'day_window' as const,
          daysOfWeek: [2, 3],
          preferredDay: 2,
          label: 'Tue/Wed',
        },
      },
    ];

    expect(
      getSuggestedDayConfig(dayConfigs, new Date('2026-06-29T12:00:00.000Z'))
        ?.id,
    ).toBe('push');
    expect(
      getSuggestedDayConfig(dayConfigs, new Date('2026-06-30T12:00:00.000Z'))
        ?.id,
    ).toBe('pull');
    expect(
      getSuggestedDayConfig(dayConfigs, new Date('2026-07-03T12:00:00.000Z')),
    ).toBeNull();
  });

  test('tracks whether a manual selection happened today', () => {
    expect(
      wasManualDaySelectedToday(
        '2026-06-30T08:00:00.000Z',
        new Date('2026-06-30T20:00:00.000Z'),
      ),
    ).toBe(true);
    expect(
      wasManualDaySelectedToday(
        '2026-06-29T23:59:00.000Z',
        new Date('2026-06-30T20:00:00.000Z'),
      ),
    ).toBe(false);
    expect(wasManualDaySelectedToday('bad-date')).toBe(false);
  });

  test('uses schedule suggestion unless the user already picked a day today', () => {
    const dayConfigs = [
      {
        id: 'push',
        name: 'A, Push',
        icon: 'Activity',
        schedule: {
          type: 'fixed_day' as const,
          preferredDay: 1,
          label: 'Mon',
        },
      },
      {
        id: 'pull',
        name: 'B, Back',
        icon: 'Clock',
        schedule: {
          type: 'day_window' as const,
          daysOfWeek: [2, 3],
          preferredDay: 2,
          label: 'Tue/Wed',
        },
      },
    ];

    expect(
      resolveSelectedDay({
        dayConfigs,
        currentDay: 'push',
        date: new Date('2026-06-30T12:00:00.000Z'),
      }),
    ).toBe('pull');

    expect(
      resolveSelectedDay({
        dayConfigs,
        currentDay: 'push',
        currentDaySelectedAt: '2026-06-30T08:00:00.000Z',
        date: new Date('2026-06-30T12:00:00.000Z'),
      }),
    ).toBe('push');

    expect(
      resolveSelectedDay({
        dayConfigs,
        currentDay: 'push',
        currentDaySelectedAt: '2026-06-29T08:00:00.000Z',
        date: new Date('2026-06-30T12:00:00.000Z'),
      }),
    ).toBe('pull');
  });
});
