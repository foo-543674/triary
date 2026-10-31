import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { sessionKeys } from '../keys';

/** `DELETE /api/v1/sets/{id}`. */
export const createDeleteSetMutation = (sessionId: () => string) => {
  const queryClient = useQueryClient();
  return createMutation<void, ApiError, string>(() => ({
    mutationFn: async (setId) => {
      const result = await call<void>(
        apiClient.DELETE('/api/v1/sets/{set_id}', { params: { path: { set_id: setId } } }),
      );
      if (!result.ok) throw result.error;
      return undefined;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId()) }),
  }));
};
