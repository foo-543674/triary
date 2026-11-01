import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { authKeys } from '../keys';
import type { Credentials, SignedInUser } from './signup';

/** `POST /web/v1/login`. On success the browser holds the session cookie. */
export const createLoginMutation = (options: { onSuccess: (user: SignedInUser) => void }) => {
  const queryClient = useQueryClient();
  return createMutation<SignedInUser, ApiError, Credentials>(() => ({
    mutationFn: async (body) => {
      const result = await call(apiClient.POST('/web/v1/login', { body }));
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user);
      options.onSuccess(user);
    },
  }));
};
