import { createQuery } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient, type Session } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { sessionKeys } from '../keys';

/** One whole session; `null` when it does not exist (404). */
export const createSessionQuery = (id: () => string) =>
  createQuery<Session | null, ApiError>(() => ({
    queryKey: sessionKeys.detail(id()),
    queryFn: async () => {
      const result = await call(
        apiClient.GET('/api/v1/sessions/{session_id}', { params: { path: { session_id: id() } } }),
      );
      if (result.ok) return result.value;
      if (result.error.status === 404) return null;
      throw result.error;
    },
  }));
