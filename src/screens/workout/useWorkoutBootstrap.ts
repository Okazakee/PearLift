import { useEffect } from 'react';
import { initializeWorkoutRuntime } from '@/screens/workout/services';

export function useWorkoutBootstrap() {
  useEffect(() => {
    void initializeWorkoutRuntime();
  }, []);
}
