import { normalizeExercise } from '@/backup/normalization';
import type { ChangeSummary, PwaBackupV2, SettingChange } from '@/backup/types';
import type { DayConfig, Exercise, WeekConfig } from '@/types';

function serializeExerciseForDiff(exercise: Exercise, weight: number) {
  return [
    exercise.name,
    exercise.sets,
    exercise.reps,
    exercise.baseWeight,
    exercise.muscleGroup,
    exercise.notes,
    weight,
  ].join('|');
}

function getWorkoutMap(workouts: PwaBackupV2['data']['workouts']) {
  return new Map(workouts.map((workout) => [workout.id, workout]));
}

function buildSettingDiff(
  current: PwaBackupV2,
  incoming: PwaBackupV2,
): SettingChange[] {
  const changes: SettingChange[] = [];
  const a = current.data.settings;
  const b = incoming.data.settings;

  if (a.currentWeek !== b.currentWeek) {
    changes.push({
      key: 'Current Week',
      from: String(a.currentWeek),
      to: String(b.currentWeek),
    });
  }

  if ((a.currentDay ?? '') !== (b.currentDay ?? '')) {
    changes.push({
      key: 'Current Day',
      from: a.currentDay ?? '-',
      to: b.currentDay ?? '-',
    });
  }

  if (a.restDuration !== b.restDuration) {
    changes.push({
      key: 'Rest Duration',
      from: `${a.restDuration}s`,
      to: `${b.restDuration}s`,
    });
  }

  const aTheme = a.themeMode ?? (a.darkMode ? 'dark' : 'light');
  const bTheme = b.themeMode ?? (b.darkMode ? 'dark' : 'light');
  if (aTheme !== bTheme) {
    const label = (value: typeof aTheme) => {
      if (value === 'system') return 'System';
      return value === 'dark' ? 'Dark' : 'Light';
    };
    changes.push({
      key: 'Theme',
      from: label(aTheme),
      to: label(bTheme),
    });
  }

  const aUnit = a.weightUnit ?? 'kg';
  const bUnit = b.weightUnit ?? 'kg';
  if (aUnit !== bUnit) {
    changes.push({
      key: 'Weight Unit',
      from: aUnit.toUpperCase(),
      to: bUnit.toUpperCase(),
    });
  }

  return changes;
}

function formatWeekConfig(value: WeekConfig) {
  const loadPct = Math.round((value.loadModifier - 1) * 100);
  const loadLabel =
    loadPct === 0 ? '0%' : loadPct > 0 ? `+${loadPct}%` : `${loadPct}%`;
  return `${value.name} (RIR ${value.rir}, Load ${loadLabel})`;
}

function buildWeekConfigDiff(
  current: PwaBackupV2,
  incoming: PwaBackupV2,
): SettingChange[] {
  const a = current.data.weekConfigs ?? [];
  const b = incoming.data.weekConfigs ?? [];

  const aMap = new Map(a.map((item) => [item.id, item]));
  const bMap = new Map(b.map((item) => [item.id, item]));
  const ids = new Set([...aMap.keys(), ...bMap.keys()]);

  const changes: SettingChange[] = [];
  for (const id of [...ids].sort((x, y) => x - y)) {
    const from = aMap.get(id);
    const to = bMap.get(id);
    const key = `Week ${id}`;
    if (!from && to) {
      changes.push({ key, from: '-', to: formatWeekConfig(to) });
      continue;
    }
    if (from && !to) {
      changes.push({ key, from: formatWeekConfig(from), to: '-' });
      continue;
    }
    if (!from || !to) continue;
    if (
      from.name !== to.name ||
      from.rir !== to.rir ||
      from.loadModifier !== to.loadModifier
    ) {
      changes.push({
        key,
        from: formatWeekConfig(from),
        to: formatWeekConfig(to),
      });
    }
  }

  return changes;
}

function formatDayConfig(value: DayConfig) {
  return `${value.name} (${value.id}, ${value.icon})`;
}

function buildDayConfigDiff(
  current: PwaBackupV2,
  incoming: PwaBackupV2,
): SettingChange[] {
  const a = current.data.dayConfigs ?? [];
  const b = incoming.data.dayConfigs ?? [];

  const aMap = new Map(a.map((item) => [item.id, item]));
  const bMap = new Map(b.map((item) => [item.id, item]));
  const ids = new Set([...aMap.keys(), ...bMap.keys()]);

  const changes: SettingChange[] = [];
  for (const id of [...ids].sort()) {
    const from = aMap.get(id);
    const to = bMap.get(id);
    const key = `Day ${id}`;
    if (!from && to) {
      changes.push({ key, from: '-', to: formatDayConfig(to) });
      continue;
    }
    if (from && !to) {
      changes.push({ key, from: formatDayConfig(from), to: '-' });
      continue;
    }
    if (!from || !to) continue;
    if (from.name !== to.name || from.icon !== to.icon) {
      changes.push({
        key,
        from: formatDayConfig(from),
        to: formatDayConfig(to),
      });
    }
  }

  return changes;
}

export function computeImportDiff(
  current: PwaBackupV2,
  incoming: PwaBackupV2,
): ChangeSummary {
  const changes: ChangeSummary = {
    workouts: [],
    settings: [],
    weekConfigs: [],
    dayConfigs: [],
    totalChanges: 0,
  };

  const currentMap = getWorkoutMap(current.data.workouts);
  const incomingMap = getWorkoutMap(incoming.data.workouts);
  const workoutIds = new Set([...currentMap.keys(), ...incomingMap.keys()]);

  for (const workoutId of workoutIds) {
    const currentWorkout = currentMap.get(workoutId);
    const incomingWorkout = incomingMap.get(workoutId);

    if (!currentWorkout && incomingWorkout) {
      const added = incomingWorkout.exercises.length;
      changes.workouts.push({
        workoutId: incomingWorkout.id,
        name: incomingWorkout.name,
        added,
        removed: 0,
        modified: 0,
      });
      changes.totalChanges += added || 1;
      continue;
    }

    if (currentWorkout && !incomingWorkout) {
      const removed = currentWorkout.exercises.length;
      changes.workouts.push({
        workoutId: currentWorkout.id,
        name: currentWorkout.name,
        added: 0,
        removed,
        modified: 0,
      });
      changes.totalChanges += removed || 1;
      continue;
    }

    if (!currentWorkout || !incomingWorkout) continue;

    const currentExercises = new Map(
      currentWorkout.exercises.map((exercise, index) => {
        const weight = current.data.userWeights[exercise.id] ?? 0;
        const normalized = normalizeExercise(exercise, index);
        return [exercise.id, serializeExerciseForDiff(normalized, weight)];
      }),
    );
    const incomingExercises = new Map(
      incomingWorkout.exercises.map((exercise, index) => {
        const weight = incoming.data.userWeights[exercise.id] ?? 0;
        const normalized = normalizeExercise(exercise, index);
        return [exercise.id, serializeExerciseForDiff(normalized, weight)];
      }),
    );

    let added = 0;
    let removed = 0;
    let modified = 0;
    const exerciseIds = new Set([
      ...currentExercises.keys(),
      ...incomingExercises.keys(),
    ]);

    for (const id of exerciseIds) {
      const a = currentExercises.get(id);
      const b = incomingExercises.get(id);
      if (!a && b) added += 1;
      else if (a && !b) removed += 1;
      else if (a && b && a !== b) modified += 1;
    }

    if (added > 0 || removed > 0 || modified > 0) {
      changes.workouts.push({
        workoutId: incomingWorkout.id,
        name: incomingWorkout.name,
        added,
        removed,
        modified,
      });
      changes.totalChanges += added + removed + modified;
    }
  }

  changes.settings = buildSettingDiff(current, incoming);
  changes.totalChanges += changes.settings.length;

  changes.weekConfigs = buildWeekConfigDiff(current, incoming);
  changes.totalChanges += changes.weekConfigs.length;

  changes.dayConfigs = buildDayConfigDiff(current, incoming);
  changes.totalChanges += changes.dayConfigs.length;

  return changes;
}
