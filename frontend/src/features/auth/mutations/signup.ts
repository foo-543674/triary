import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { authKeys } from '../keys';

export type Credentials = { readonly user_id: string; readonly password: string };
export type SignedInUser = { readonly user_id: string };

/** `POST /web/v1/signup`. On success the browser holds the session cookie. */
export const createSignupMutation = (options: { onSuccess: (user: SignedInUser) => void }) => {
  const queryClient = useQueryClient();
  return createMutation<SignedInUser, ApiError, Credentials>(() => ({
    mutationFn: async (body) => {
      const result = await call(apiClient.POST('/web/v1/signup', { body }));
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
