import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { sessionKeys } from '../keys';

/** `DELETE /api/v1/blocks/{id}` with its sets. */
export const createDeleteBlockMutation = (sessionId: () => string) => {
  const queryClient = useQueryClient();
  return createMutation<void, ApiError, string>(() => ({
    mutationFn: async (blockId) => {
      const result = await call<void>(
        apiClient.DELETE('/api/v1/blocks/{block_id}', { params: { path: { block_id: blockId } } }),
      );
      if (!result.ok) throw result.error;
      return undefined;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId()) }),
  }));
};
