import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient } from '../../../api/client';
import { type ApiError, isUnauthenticated } from '../../../lib/api-error';
import { authKeys } from '../keys';

/**
 * `POST /web/v1/logout`. Afterwards no cached data of the user is kept.
 * A session that was already gone (401) counts as logged out.
 */
export const createLogoutMutation = (options: { onSuccess: () => void }) => {
  const queryClient = useQueryClient();
  return createMutation<void, ApiError, void>(() => ({
    mutationFn: async () => {
      const result = await call<void>(apiClient.POST('/web/v1/logout'));
      if (!result.ok && !isUnauthenticated(result.error)) {
        throw result.error;
      }
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(authKeys.me, null);
      options.onSuccess();
    },
  }));
};
