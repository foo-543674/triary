import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient, type SetValues, type WorkoutSet } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { sessionKeys } from '../keys';

export type AppendSetVariables = { readonly blockId: string; readonly values: SetValues };

/** `POST /api/v1/blocks/{id}/sets`; the session is reloaded afterwards. */
export const createAppendSetMutation = (sessionId: () => string) => {
  const queryClient = useQueryClient();
  return createMutation<WorkoutSet, ApiError, AppendSetVariables>(() => ({
    mutationFn: async ({ blockId, values }) => {
      const result = await call(
        apiClient.POST('/api/v1/blocks/{block_id}/sets', {
          params: { path: { block_id: blockId } },
          body: values,
        }),
      );
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId()) }),
  }));
};
