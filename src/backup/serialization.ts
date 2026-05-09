import type { PearLiftRuntimeState, PwaBackupV2 } from '@/backup/types';

export function toPwaBackupV2(state: PearLiftRuntimeState): PwaBackupV2 {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      workouts: state.workouts.map((workout) => ({
        ...workout,
        exercises: workout.exercises.map((exercise, index) => ({
          ...exercise,
          notes: exercise.notes ?? '',
          position: Number.isFinite(Number(exercise.position))
            ? exercise.position
            : index,
        })),
      })),
      userWeights: state.userWeights,
      weekConfigs: state.weekConfigs,
      dayConfigs: state.dayConfigs,
      settings: {
        currentWeek: state.currentWeek,
        currentDay: state.currentDay,
        restDuration: state.restDuration,
        darkMode: state.themeMode === 'dark',
        themeMode: state.themeMode,
        weightUnit: state.weightUnit,
      },
    },
  };
}

export function serializePwaBackupV2(state: PearLiftRuntimeState): string {
  return JSON.stringify(toPwaBackupV2(state), null, 2);
}
