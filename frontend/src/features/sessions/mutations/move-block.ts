import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient, type ExerciseBlock } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { sessionKeys } from '../keys';

/** `PATCH /api/v1/blocks/{id}` with a new position. */
export const createMoveBlockMutation = (sessionId: () => string) => {
  const queryClient = useQueryClient();
  return createMutation<
    ExerciseBlock,
    ApiError,
    { readonly blockId: string; readonly order: number }
  >(() => ({
    mutationFn: async ({ blockId, order }) => {
      const result = await call(
        apiClient.PATCH('/api/v1/blocks/{block_id}', {
          params: { path: { block_id: blockId } },
          body: { order },
        }),
      );
      if (!result.ok) throw result.error;
      return result.value;
    },
    // All session queries, including the history list built from them.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  }));
};
