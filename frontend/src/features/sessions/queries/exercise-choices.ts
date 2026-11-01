import { createQuery } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient, type Exercise } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';

/**
 * Exercises offered when adding a block. Its own query (not the exercises
 * feature's): features do not import each other (.dependency-cruiser.cjs).
 */
export const createExerciseChoicesQuery = () =>
  createQuery<readonly Exercise[], ApiError>(() => ({
    queryKey: ['sessions', 'exercise-choices'] as const,
    queryFn: async () => {
      const result = await call(apiClient.GET('/api/v1/exercises'));
      if (!result.ok) throw result.error;
      return result.value.items;
    },
  }));
