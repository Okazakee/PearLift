import type { PearLiftBackupV3, PearLiftRuntimeState } from '@/backup/types';

export function toPearLiftBackupV3(
  state: PearLiftRuntimeState,
): PearLiftBackupV3 {
  return {
    version: 3,
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
        themeMode: state.themeMode,
        weightUnit: state.weightUnit,
        language: state.language,
      },
    },
  };
}

export function serializePearLiftBackupV3(state: PearLiftRuntimeState): string {
  return JSON.stringify(toPearLiftBackupV3(state), null, 2);
}
