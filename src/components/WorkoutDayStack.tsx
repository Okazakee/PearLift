import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ThemeTokens } from '../theme/tokens';
import type {
  DayConfig,
  Exercise,
  UserWeights,
  WeekConfig,
  WeightUnit,
  WorkoutDay,
  WorkoutSession,
} from '../types';
import { WorkoutView } from './WorkoutView';

interface WorkoutDayStackProps {
  tokens: ThemeTokens;
  weightUnit: WeightUnit;
  contentBottomPadding: number;
  fabBottom: number;
  dayConfigs: DayConfig[];
  workouts: WorkoutSession[];
  selectedDay: WorkoutDay;
  currentWeek: number;
  weekConfigs: WeekConfig[];
  userWeights: UserWeights;
  getAdjustedWeight: (exerciseId: string, weekId?: number) => number;
  onWeekChange: (id: number) => void;
  onOpenProgramSettings: () => void;
  onOpenAddExercise: () => void;
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
  dayConfigs,
  workouts,
  selectedDay,
  currentWeek,
  weekConfigs,
  userWeights,
  getAdjustedWeight,
  onWeekChange,
  onOpenProgramSettings,
  onOpenAddExercise,
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
              currentWeek={currentWeek}
              weekConfigs={weekConfigs}
              userWeights={userWeights}
              getAdjustedWeight={getAdjustedWeight}
              onWeekChange={onWeekChange}
              onOpenProgramSettings={onOpenProgramSettings}
              onOpenAddExercise={onOpenAddExercise}
              onEditExercise={onEditExercise}
              onDeleteExercise={onDeleteExercise}
              onAdjustWeight={onAdjustWeight}
              onSetWeight={onSetWeight}
              onReorderExercises={onReorderExercises}
              contentBottomPadding={contentBottomPadding}
              fabBottom={fabBottom}
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
    ...StyleSheet.absoluteFillObject,
  },
});
