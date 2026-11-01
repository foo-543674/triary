import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient, type Session } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { sessionKeys } from '../keys';

/** `PATCH /api/v1/sessions/{id}`: date and/or note. */
export const createUpdateSessionMutation = (sessionId: () => string) => {
  const queryClient = useQueryClient();
  return createMutation<
    Session,
    ApiError,
    { readonly workout_date?: string; readonly note?: string | null }
  >(() => ({
    mutationFn: async (body) => {
      const result = await call(
        apiClient.PATCH('/api/v1/sessions/{session_id}', {
          params: { path: { session_id: sessionId() } },
          body,
        }),
      );
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: (session) => {
      queryClient.setQueryData(sessionKeys.detail(session.id), session);
      return queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  }));
};
