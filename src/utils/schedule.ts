import type { DayConfig } from '@/types';

export function getDayDisplayInfo(
  day: Pick<DayConfig, 'name' | 'schedule' | 'sessionLabel'>,
) {
  const trimmedName = day.name.trim();
  const match = trimmedName.match(/^([A-Z])\s*[,:-]\s*(.+)$/);
  const sessionLabel = day.sessionLabel?.trim() || match?.[1] || null;
  const title = day.sessionLabel?.trim().length
    ? trimmedName || 'Workout'
    : match?.[2]?.trim() || trimmedName || 'Workout';
  const scheduleLabel = day.schedule?.label?.trim() || null;
  const metaLabel =
    [sessionLabel, scheduleLabel].filter(Boolean).join(' · ') || null;

  return {
    sessionLabel,
    title,
    scheduleLabel,
    metaLabel,
  };
}

export function getIsoWeekday(date = new Date()) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function wasManualDaySelectedToday(
  selectedAt: string | null | undefined,
  date = new Date(),
) {
  if (!selectedAt) {
    return false;
  }

  const parsed = new Date(selectedAt);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return toLocalDateKey(parsed) === toLocalDateKey(date);
}

export function getSuggestedDayConfig(
  dayConfigs: DayConfig[],
  date = new Date(),
): DayConfig | null {
  const weekday = getIsoWeekday(date);

  for (const day of dayConfigs) {
    const schedule = day.schedule;
    if (!schedule) {
      continue;
    }
    if (schedule.type === 'fixed_day' && schedule.preferredDay === weekday) {
      return day;
    }
    if (
      schedule.type === 'day_window' &&
      schedule.daysOfWeek?.includes(weekday)
    ) {
      return day;
    }
  }

  return null;
}

export function resolveSelectedDay(args: {
  dayConfigs: DayConfig[];
  currentDay: string;
  currentDaySelectedAt?: string | null;
  date?: Date;
}) {
  const {
    dayConfigs,
    currentDay,
    currentDaySelectedAt,
    date = new Date(),
  } = args;
  const fallbackDayId = dayConfigs[0]?.id ?? currentDay;
  const currentDayId = dayConfigs.some((day) => day.id === currentDay)
    ? currentDay
    : fallbackDayId;
  const suggestedDay = getSuggestedDayConfig(dayConfigs, date);

  if (!suggestedDay) {
    return currentDayId;
  }

  if (wasManualDaySelectedToday(currentDaySelectedAt, date)) {
    return currentDayId;
  }

  return suggestedDay.id;
}
