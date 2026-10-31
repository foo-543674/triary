import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { sessionKeys } from '../keys';

/** `DELETE /api/v1/sessions/{id}` with everything recorded in it (US-8). */
export const createDeleteSessionMutation = (
  sessionId: () => string,
  options: { onSuccess: () => void },
) => {
  const queryClient = useQueryClient();
  return createMutation<void, ApiError, void>(() => ({
    mutationFn: async () => {
      const result = await call<void>(
        apiClient.DELETE('/api/v1/sessions/{session_id}', {
          params: { path: { session_id: sessionId() } },
        }),
      );
      if (!result.ok) throw result.error;
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: sessionKeys.detail(sessionId()) });
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      options.onSuccess();
    },
  }));
};
