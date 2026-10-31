import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient, type Session } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { sessionKeys } from '../keys';

/** `POST /api/v1/sessions` with the client's local date (US-7). */
export const createStartSessionMutation = (options: { onSuccess: (session: Session) => void }) => {
  const queryClient = useQueryClient();
  return createMutation<Session, ApiError, { workout_date: string }>(() => ({
    mutationFn: async (body) => {
      const result = await call(apiClient.POST('/api/v1/sessions', { body }));
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: (session) => {
      queryClient.setQueryData(sessionKeys.detail(session.id), session);
      options.onSuccess(session);
    },
  }));
};
