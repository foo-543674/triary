import { createQuery } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import type { ExerciseDetail } from '../../../api/client';
import { apiClient } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { exerciseKeys } from '../keys';

/** One exercise; `null` when it does not exist (404). */
export const createExerciseQuery = (id: () => string) =>
  createQuery<ExerciseDetail | null, ApiError>(() => ({
    queryKey: exerciseKeys.detail(id()),
    queryFn: async () => {
      const result = await call(
        apiClient.GET('/api/v1/exercises/{exercise_id}', {
          params: { path: { exercise_id: id() } },
        }),
      );
      if (result.ok) {
        return result.value;
      }
      if (result.error.status === 404) {
        return null;
      }
      throw result.error;
    },
  }));
