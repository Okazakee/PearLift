import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WorkoutView } from '@/components/WorkoutView';
import type { ThemeTokens } from '@/theme/tokens';
import type {
  DayConfig,
  Exercise,
  TrainingProgram,
  UserExerciseSettingsMap,
  WeekConfig,
  WeightUnit,
  WorkoutDay,
  WorkoutSession,
} from '@/types';

interface WorkoutDayStackProps {
  tokens: ThemeTokens;
  weightUnit: WeightUnit;
  contentBottomPadding: number;
  fabBottom: number;
  contentMaxWidth: number;
  exerciseColumns: number;
  dayConfigs: DayConfig[];
  workouts: WorkoutSession[];
  selectedDay: WorkoutDay;
  program?: TrainingProgram | null;
  currentWeek: number;
  weekConfigs: WeekConfig[];
  userExerciseSettings: UserExerciseSettingsMap;
  restDuration: number;
  getAdjustedWeight: (exerciseId: string, weekId?: number) => number;
  suggestedDayName?: string | null;
  onWeekChange: (id: number) => void;
  onOpenProgramSettings: () => void;
  onOpenProgressionSuggestions: () => void;
  onOpenWorkoutLog: () => void;
  pendingProgressionSuggestionCount: number;
  onOpenAddExercise: () => void;
  onOpenExerciseSettings: (exercise: Exercise) => void;
  onApplyRestPreset: (restSeconds: number) => void;
  onEditExercise: (exercise: Exercise) => void;
  onDeleteExercise: (exercise: Exercise) => void;
  onAdjustWeight: (exerciseId: string, delta: number) => void;
  onSetWeight: (exerciseId: string, value: number) => void;
  onReorderExercises: (orderedExerciseIds: string[]) => void;
}

export function WorkoutDayStack({
  tokens,
  weightUnit,
  contentBottomPadding,
  fabBottom,
  contentMaxWidth,
  exerciseColumns,
  dayConfigs,
  workouts,
  selectedDay,
  program,
  currentWeek,
  weekConfigs,
  userExerciseSettings,
  restDuration,
  getAdjustedWeight,
  suggestedDayName,
  onWeekChange,
  onOpenProgramSettings,
  onOpenProgressionSuggestions,
  onOpenWorkoutLog,
  pendingProgressionSuggestionCount,
  onOpenAddExercise,
  onOpenExerciseSettings,
  onApplyRestPreset,
  onEditExercise,
  onDeleteExercise,
  onAdjustWeight,
  onSetWeight,
  onReorderExercises,
}: WorkoutDayStackProps) {
  const workoutById = useMemo(() => {
    const map = new Map<string, WorkoutSession>();
    for (const workout of workouts) map.set(workout.id, workout);
    return map;
  }, [workouts]);

  return (
    <View style={styles.container}>
      {dayConfigs.map((day) => {
        const workout =
          workoutById.get(day.id) ??
          ({
            id: day.id,
            name: day.name,
            description: '',
            exercises: [],
          } satisfies WorkoutSession);
        const active = selectedDay === day.id;
        return (
          <View
            key={day.id}
            style={[styles.layer, { opacity: active ? 1 : 0 }]}
            pointerEvents={active ? 'auto' : 'none'}
            accessibilityElementsHidden={!active}
            importantForAccessibility={active ? 'yes' : 'no-hide-descendants'}
          >
            <WorkoutView
              isActive={active}
              tokens={tokens}
              weightUnit={weightUnit}
              workout={workout}
              dayConfig={day}
              program={program}
              currentWeek={currentWeek}
              weekConfigs={weekConfigs}
              userExerciseSettings={userExerciseSettings}
              restDuration={restDuration}
              getAdjustedWeight={getAdjustedWeight}
              suggestedDayName={suggestedDayName}
              onWeekChange={onWeekChange}
              onOpenProgramSettings={onOpenProgramSettings}
              onOpenProgressionSuggestions={onOpenProgressionSuggestions}
              onOpenWorkoutLog={onOpenWorkoutLog}
              pendingProgressionSuggestionCount={
                pendingProgressionSuggestionCount
              }
              onOpenAddExercise={onOpenAddExercise}
              onOpenExerciseSettings={onOpenExerciseSettings}
              onApplyRestPreset={onApplyRestPreset}
              onEditExercise={onEditExercise}
              onDeleteExercise={onDeleteExercise}
              onAdjustWeight={onAdjustWeight}
              onSetWeight={onSetWeight}
              onReorderExercises={onReorderExercises}
              contentBottomPadding={contentBottomPadding}
              fabBottom={fabBottom}
              contentMaxWidth={contentMaxWidth}
              exerciseColumns={exerciseColumns}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  layer: {
    ...StyleSheet.absoluteFill,
  },
});
