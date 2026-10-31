import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient, type ExerciseBlock } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { sessionKeys } from '../keys';

/** `POST /api/v1/sessions/{id}/blocks`; the session is reloaded afterwards. */
export const createAppendBlockMutation = (sessionId: () => string) => {
  const queryClient = useQueryClient();
  return createMutation<ExerciseBlock, ApiError, { exercise_id: string }>(() => ({
    mutationFn: async (body) => {
      const result = await call(
        apiClient.POST('/api/v1/sessions/{session_id}/blocks', {
          params: { path: { session_id: sessionId() } },
          body,
        }),
      );
      if (!result.ok) throw result.error;
      return result.value;
    },
    // All session queries, including the history list built from them.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  }));
};
