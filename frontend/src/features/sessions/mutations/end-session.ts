import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient, type Session } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { sessionKeys } from '../keys';

/** `POST /api/v1/sessions/{id}/end` (idempotent). */
export const createEndSessionMutation = (sessionId: () => string) => {
  const queryClient = useQueryClient();
  return createMutation<Session, ApiError, void>(() => ({
    mutationFn: async () => {
      const result = await call(
        apiClient.POST('/api/v1/sessions/{session_id}/end', {
          params: { path: { session_id: sessionId() } },
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
