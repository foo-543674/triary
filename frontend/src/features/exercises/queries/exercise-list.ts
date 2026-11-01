import { createQuery } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import type { Exercise } from '../../../api/client';
import { apiClient } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { exerciseKeys } from '../keys';

/** Every exercise the user can use: presets and their own (US-4). */
export const createExerciseListQuery = () =>
  createQuery<readonly Exercise[], ApiError>(() => ({
    queryKey: exerciseKeys.list(),
    queryFn: async () => {
      const result = await call(apiClient.GET('/api/v1/exercises'));
      if (!result.ok) {
        throw result.error;
      }
      return result.value.items;
    },
  }));
