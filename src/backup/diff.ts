import { normalizeExercise } from '@/backup/normalization';
import type {
  ChangeSummary,
  ExerciseImportChange,
  PearLiftBackupV4,
  PearLiftRuntimeState,
  PreservedWeightChange,
  SettingChange,
} from '@/backup/types';
import type { DayConfig, Exercise, WeekConfig } from '@/types';

function serializeExerciseForDiff(exercise: Exercise) {
  return [
    exercise.canonicalExerciseId ?? '',
    exercise.name,
    JSON.stringify(exercise.aliases ?? []),
    exercise.variantLabel ?? '',
    exercise.sessionSpecific === true ? '1' : '0',
    exercise.sets,
    exercise.reps,
    exercise.baseWeight,
    exercise.muscleGroup,
    exercise.notes,
    JSON.stringify(exercise.advanced ?? null),
  ].join('|');
}

function getWorkoutMap(workouts: PearLiftBackupV4['data']['workouts']) {
  return new Map(workouts.map((workout) => [workout.id, workout]));
}

function readMeaningfulWeight(
  weights: PearLiftBackupV4['data']['userWeights'],
  exerciseId: string,
) {
  const value = weights[exerciseId];
  return Number.isFinite(value) && value > 0 ? value : null;
}

function hasStartingWeight(
  exercise: Exercise,
  weights: PearLiftBackupV4['data']['userWeights'],
) {
  return (
    readMeaningfulWeight(weights, exercise.id) != null ||
    exercise.baseWeight > 0
  );
}

function toExerciseChange(
  workoutId: string,
  workoutName: string,
  exercise: Exercise,
): ExerciseImportChange {
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    workoutId,
    workoutName,
  };
}

function toPreservedWeightChange(
  workoutId: string,
  workoutName: string,
  exercise: Exercise,
  weight: number,
): PreservedWeightChange {
  return {
    ...toExerciseChange(workoutId, workoutName, exercise),
    weight,
  };
}

function buildSettingDiff(
  current: PearLiftBackupV4,
  incoming: PearLiftBackupV4,
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

  const aTheme = a.themeMode;
  const bTheme = b.themeMode;
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

function formatProgramValue(value: string | number | null | undefined) {
  if (value == null) {
    return '-';
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : '-';
}

function formatFrequencySummary(
  value:
    | Array<{
        muscleGroup?: unknown;
        targetPerWeek?: unknown;
      }>
    | undefined,
) {
  if (!Array.isArray(value) || value.length === 0) {
    return '-';
  }

  return value
    .map((item) =>
      typeof item?.muscleGroup === 'string' &&
      Number.isFinite(item?.targetPerWeek)
        ? `${item.muscleGroup} ${item.targetPerWeek}x/wk`
        : null,
    )
    .filter((item): item is string => item != null)
    .join(', ');
}

function buildProgramMetadataDiff(
  current: PearLiftBackupV4,
  incoming: PearLiftBackupV4,
): SettingChange[] {
  const a = current.data.program ?? null;
  const b = incoming.data.program ?? null;
  const changes: SettingChange[] = [];

  const pushChange = (
    key: string,
    from: string | number | null | undefined,
    to: string | number | null | undefined,
  ) => {
    if ((from ?? '') === (to ?? '')) {
      return;
    }
    changes.push({
      key,
      from: formatProgramValue(from),
      to: formatProgramValue(to),
    });
  };

  pushChange('Program Name', a?.name, b?.name);
  pushChange('Subtitle', a?.subtitle, b?.subtitle);
  pushChange('Goal', a?.goal, b?.goal);
  pushChange('Description', a?.description, b?.description);
  pushChange('Start Date', a?.startDate, b?.startDate);
  pushChange('Duration', a?.durationWeeks, b?.durationWeeks);
  pushChange('Schedule Type', a?.scheduleType, b?.scheduleType);
  pushChange('Progression Model', a?.progressionModel, b?.progressionModel);
  pushChange(
    'Program Default Rest',
    a?.defaultRestSeconds,
    b?.defaultRestSeconds,
  );

  const fromSource = a?.source?.label ?? a?.source?.type ?? null;
  const toSource = b?.source?.label ?? b?.source?.type ?? null;
  pushChange('Source', fromSource, toSource);

  const fromFrequency = formatFrequencySummary(a?.frequencySummary);
  const toFrequency = formatFrequencySummary(b?.frequencySummary);
  if (fromFrequency !== toFrequency) {
    changes.push({
      key: 'Frequency Summary',
      from: fromFrequency,
      to: toFrequency,
    });
  }

  return changes;
}

function formatWeekConfig(value: WeekConfig) {
  const loadPct = Math.round((value.loadModifier - 1) * 100);
  const loadLabel =
    loadPct === 0 ? '0%' : loadPct > 0 ? `+${loadPct}%` : `${loadPct}%`;
  const volumePct = Math.round(((value.volumeModifier ?? 1) - 1) * 100);
  const volumeLabel =
    volumePct === 0 ? '0%' : volumePct > 0 ? `+${volumePct}%` : `${volumePct}%`;
  const notesLabel = value.notes ? `, Notes ${value.notes}` : '';
  return `${value.name} (RIR ${value.rir}, Load ${loadLabel}, Volume ${volumeLabel}${notesLabel})`;
}

function buildWeekConfigDiff(
  current: PearLiftBackupV4,
  incoming: PearLiftBackupV4,
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
      from.loadModifier !== to.loadModifier ||
      (from.volumeModifier ?? 1) !== (to.volumeModifier ?? 1) ||
      (from.notes ?? '') !== (to.notes ?? '')
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
  const scheduleLabel = formatDaySchedule(value.schedule);
  return `${value.sessionLabel ? `${value.sessionLabel} · ` : ''}${value.name} (${value.id}, ${value.icon}${scheduleLabel ? `, ${scheduleLabel}` : ''})`;
}

function formatWeekdayShort(weekday: number) {
  switch (weekday) {
    case 1:
      return 'Mon';
    case 2:
      return 'Tue';
    case 3:
      return 'Wed';
    case 4:
      return 'Thu';
    case 5:
      return 'Fri';
    case 6:
      return 'Sat';
    case 7:
      return 'Sun';
    default:
      return String(weekday);
  }
}

function formatDaySchedule(schedule: DayConfig['schedule']) {
  if (!schedule) {
    return '';
  }

  switch (schedule.type) {
    case 'fixed_day':
      return schedule.label ?? formatWeekdayShort(schedule.preferredDay ?? 0);
    case 'day_window':
      return (
        schedule.label ??
        (schedule.daysOfWeek?.map((day) => formatWeekdayShort(day)).join('/') ||
          '')
      );
    case 'rotation':
      return schedule.label ?? 'Rotation';
    case 'unscheduled':
      return '';
    default:
      return '';
  }
}

function buildDayConfigDiff(
  current: PearLiftBackupV4,
  incoming: PearLiftBackupV4,
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
    if (
      from.name !== to.name ||
      from.sessionLabel !== to.sessionLabel ||
      from.icon !== to.icon ||
      formatDaySchedule(from.schedule) !== formatDaySchedule(to.schedule)
    ) {
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
  current: PearLiftBackupV4,
  incoming: PearLiftBackupV4,
): ChangeSummary {
  const changes: ChangeSummary = {
    programName: incoming.data.program?.name ?? 'Imported Program',
    workouts: [],
    matchingExercises: [],
    changedExercises: [],
    newExercises: [],
    removedExercises: [],
    preservedWeights: [],
    missingWeightExercises: [],
    programMetadata: [],
    settings: [],
    weekConfigs: [],
    dayConfigs: [],
    incomingWorkoutCount: 0,
    incomingExerciseCount: 0,
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
      for (const [index, exercise] of incomingWorkout.exercises.entries()) {
        const normalized = normalizeExercise(exercise, index);
        changes.newExercises.push(
          toExerciseChange(
            incomingWorkout.id,
            incomingWorkout.name,
            normalized,
          ),
        );
        if (!hasStartingWeight(normalized, incoming.data.userWeights)) {
          changes.missingWeightExercises.push(
            toExerciseChange(
              incomingWorkout.id,
              incomingWorkout.name,
              normalized,
            ),
          );
        }
      }
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
      for (const [index, exercise] of currentWorkout.exercises.entries()) {
        const normalized = normalizeExercise(exercise, index);
        changes.removedExercises.push(
          toExerciseChange(currentWorkout.id, currentWorkout.name, normalized),
        );
      }
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
        const normalized = normalizeExercise(exercise, index);
        return [exercise.id, normalized];
      }),
    );
    const incomingExercises = new Map(
      incomingWorkout.exercises.map((exercise, index) => {
        const normalized = normalizeExercise(exercise, index);
        return [exercise.id, normalized];
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
      const currentExercise = currentExercises.get(id);
      const incomingExercise = incomingExercises.get(id);
      if (!currentExercise && incomingExercise) {
        added += 1;
        changes.newExercises.push(
          toExerciseChange(
            incomingWorkout.id,
            incomingWorkout.name,
            incomingExercise,
          ),
        );
        if (!hasStartingWeight(incomingExercise, incoming.data.userWeights)) {
          changes.missingWeightExercises.push(
            toExerciseChange(
              incomingWorkout.id,
              incomingWorkout.name,
              incomingExercise,
            ),
          );
        }
      } else if (currentExercise && !incomingExercise) {
        removed += 1;
        changes.removedExercises.push(
          toExerciseChange(
            currentWorkout.id,
            currentWorkout.name,
            currentExercise,
          ),
        );
      } else if (currentExercise && incomingExercise) {
        const preservedWeight = readMeaningfulWeight(
          current.data.userWeights,
          incomingExercise.id,
        );
        if (preservedWeight != null) {
          changes.preservedWeights.push(
            toPreservedWeightChange(
              incomingWorkout.id,
              incomingWorkout.name,
              incomingExercise,
              preservedWeight,
            ),
          );
        }

        const before = serializeExerciseForDiff(currentExercise);
        const after = serializeExerciseForDiff(incomingExercise);
        if (before === after) {
          changes.matchingExercises.push(
            toExerciseChange(
              incomingWorkout.id,
              incomingWorkout.name,
              incomingExercise,
            ),
          );
        } else {
          modified += 1;
          changes.changedExercises.push(
            toExerciseChange(
              incomingWorkout.id,
              incomingWorkout.name,
              incomingExercise,
            ),
          );
        }
      }
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

  changes.programMetadata = buildProgramMetadataDiff(current, incoming);
  changes.totalChanges += changes.programMetadata.length;

  changes.settings = buildSettingDiff(current, incoming);
  changes.totalChanges += changes.settings.length;

  changes.weekConfigs = buildWeekConfigDiff(current, incoming);
  changes.totalChanges += changes.weekConfigs.length;

  changes.dayConfigs = buildDayConfigDiff(current, incoming);
  changes.totalChanges += changes.dayConfigs.length;
  changes.incomingWorkoutCount = changes.workouts.length;
  changes.incomingExerciseCount =
    changes.newExercises.length + changes.changedExercises.length;

  return changes;
}

export function prepareImportRuntime(
  current: PearLiftRuntimeState,
  incoming: PearLiftRuntimeState,
): PearLiftRuntimeState {
  const nextWeights = { ...incoming.userWeights };

  for (const workout of incoming.workouts) {
    for (const exercise of workout.exercises) {
      const preservedWeight = readMeaningfulWeight(
        current.userWeights,
        exercise.id,
      );
      if (preservedWeight != null) {
        nextWeights[exercise.id] = preservedWeight;
      }
    }
  }

  return {
    ...incoming,
    userWeights: nextWeights,
  };
}
