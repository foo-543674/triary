import { createQuery } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient } from '../../../api/client';
import { type ApiError, isUnauthenticated } from '../../../lib/api-error';
import { authKeys } from '../keys';
import type { SignedInUser } from '../mutations/signup';

/**
 * The signed-in user, or `null` when there is no valid session
 * (`GET /web/v1/me` answering 401 `unauthenticated` is an answer, not an
 * error). Shared by every screen through the `["auth", "me"]` cache.
 */
export const createCurrentUserQuery = () =>
  createQuery<SignedInUser | null, ApiError>(() => ({
    queryKey: authKeys.me,
    queryFn: async () => {
      const result = await call(apiClient.GET('/web/v1/me'));
      if (result.ok) {
        return result.value;
      }
      if (isUnauthenticated(result.error)) {
        return null;
      }
      throw result.error;
    },
    retry: false,
  }));
