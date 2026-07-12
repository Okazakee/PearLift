import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  applyWorkoutMutation,
  finishOnboarding,
  showPrompt,
} from '@/screens/workout/services';
import type { Exercise, WorkoutDay } from '@/types';

export function useWorkoutActions(input: {
  currentWorkout: {
    id: string;
    name: string;
    exercises: Exercise[];
  };
  editingExerciseId: string | null;
  exerciseModalMode: 'add' | 'edit';
  setEditingExerciseId: (exerciseId: string | null) => void;
  setExerciseModalMode: (mode: 'add' | 'edit') => void;
  setExerciseModalOpen: (open: boolean) => void;
}) {
  const {
    currentWorkout,
    editingExerciseId,
    exerciseModalMode,
    setEditingExerciseId,
    setExerciseModalMode,
    setExerciseModalOpen,
  } = input;
  const { t } = useTranslation();

  const editingExercise = useMemo(
    () =>
      editingExerciseId
        ? (currentWorkout.exercises.find(
            (item) => item.id === editingExerciseId,
          ) ?? null)
        : null,
    [currentWorkout.exercises, editingExerciseId],
  );

  const handleOpenAdd = () => {
    setEditingExerciseId(null);
    setExerciseModalMode('add');
    setExerciseModalOpen(true);
  };

  const handleOpenEdit = (exercise: Exercise) => {
    setEditingExerciseId(exercise.id);
    setExerciseModalMode('edit');
    setExerciseModalOpen(true);
  };

  const handleExerciseSubmit = async (
    payload: Omit<Exercise, 'position' | 'baseWeight'>,
  ) => {
    const editing = editingExerciseId
      ? currentWorkout.exercises.find((item) => item.id === editingExerciseId)
      : null;

    if (exerciseModalMode === 'edit' && editing) {
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
