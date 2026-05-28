import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  applyWorkoutMutation,
  finishOnboarding,
  showPrompt,
} from '@/screens/workout/services';
import { useWorkoutUiStore } from '@/store/workoutUiStore';
import type { Exercise, WeightUnit, WorkoutDay } from '@/types';

export function useWorkoutActions(input: {
  currentWorkout: {
    id: string;
    name: string;
    exercises: Exercise[];
  };
}) {
  const { currentWorkout } = input;
  const { t } = useTranslation();
  const ui = useWorkoutUiStore();

  const editingExercise = useMemo(
    () =>
      ui.editingExerciseId
        ? (currentWorkout.exercises.find(
            (item) => item.id === ui.editingExerciseId,
          ) ?? null)
        : null,
    [currentWorkout.exercises, ui.editingExerciseId],
  );

  const handleOpenAdd = () => {
    ui.setEditingExerciseId(null);
    ui.setExerciseModalMode('add');
    ui.setExerciseModalOpen(true);
  };

  const handleOpenEdit = (exercise: Exercise) => {
    ui.setEditingExerciseId(exercise.id);
    ui.setExerciseModalMode('edit');
    ui.setExerciseModalOpen(true);
  };

  const handleExerciseSubmit = async (
    payload: Omit<Exercise, 'id' | 'position' | 'baseWeight'>,
  ) => {
    const editing = ui.editingExerciseId
      ? currentWorkout.exercises.find(
          (item) => item.id === ui.editingExerciseId,
        )
      : null;

    if (ui.exerciseModalMode === 'edit' && editing) {
      await applyWorkoutMutation({
        type: 'editExercise',
        workoutId: currentWorkout.id,
        exerciseId: editing.id,
        updates: payload,
      });
      return;
    }

    await applyWorkoutMutation({
      type: 'addExercise',
      workoutId: currentWorkout.id,
      exercise: payload,
    });
  };

  const handleDeleteExercise = (exercise: Exercise) => {
    showPrompt(
      t('prompts.deleteExercise.title'),
      t('prompts.deleteExercise.message', {
        exercise: exercise.name,
        workout: currentWorkout.name,
      }),
      [
        { label: t('common.cancel'), tone: 'cancel' },
        {
          label: t('common.delete'),
          tone: 'destructive',
          onPress: () => {
            void applyWorkoutMutation({
              type: 'deleteExercise',
              workoutId: currentWorkout.id,
              exerciseId: exercise.id,
            });
          },
        },
      ],
    );
  };

  return {
    editingExercise,
    handleOpenAdd,
    handleOpenEdit,
    handleExerciseSubmit,
    handleDeleteExercise,
    handleReorderExercises: (orderedExerciseIds: string[]) => {
      void applyWorkoutMutation({
        type: 'reorderExercises',
        workoutId: currentWorkout.id,
        orderedExerciseIds,
      });
    },
    handleWeekChange: (nextWeek: number) => {
      void applyWorkoutMutation({
        type: 'setCurrentWeek',
        currentWeek: nextWeek,
      });
    },
    handleDayChange: (nextDay: WorkoutDay, currentDay: WorkoutDay) => {
      if (nextDay === currentDay) return;
      void applyWorkoutMutation({ type: 'setCurrentDay', currentDay: nextDay });
    },
    handleRestDurationChange: (nextDuration: number) => {
      void applyWorkoutMutation({
        type: 'setRestDuration',
        restDuration: nextDuration,
      });
    },
    handleWeightUnitChange: (nextUnit: WeightUnit) => {
      void applyWorkoutMutation({
        type: 'setWeightUnit',
        weightUnit: nextUnit,
      });
    },
    handleAdjustWeight: (exerciseId: string, delta: number) => {
      void applyWorkoutMutation({
        type: 'adjustExerciseWeight',
        exerciseId,
        delta,
      });
    },
    handleSetWeight: (exerciseId: string, value: number) => {
      void applyWorkoutMutation({
        type: 'setExerciseWeight',
        exerciseId,
        value,
      });
    },
    finishOnboarding: () => {
      void finishOnboarding();
    },
  };
}
