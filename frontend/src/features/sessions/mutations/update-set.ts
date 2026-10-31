import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient, type SetValues, type WorkoutSet } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { sessionKeys } from '../keys';

/** `PATCH /api/v1/sets/{id}`: new values and/or position. */
export const createUpdateSetMutation = (sessionId: () => string) => {
  const queryClient = useQueryClient();
  return createMutation<
    WorkoutSet,
    ApiError,
    { readonly setId: string; readonly values?: SetValues; readonly order?: number }
  >(() => ({
    mutationFn: async ({ setId, values, order }) => {
      const result = await call(
        apiClient.PATCH('/api/v1/sets/{set_id}', {
          params: { path: { set_id: setId } },
          body: { ...values, order },
        }),
      );
      if (!result.ok) throw result.error;
      return result.value;
    },
    // All session queries, including the history list built from them.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  }));
};
