import { createInfiniteQuery } from '@tanstack/solid-query';
import { call } from '../../../api/call';
import { apiClient, type SessionSummary } from '../../../api/client';
import type { ApiError } from '../../../lib/api-error';
import { historyKeys } from '../keys';

type Page = { readonly items: readonly SessionSummary[]; readonly next: string | null };

/** The user's sessions by date, newest first, 30 per page (US-9). */
export const createSessionsByDateQuery = () =>
  createInfiniteQuery<Page, ApiError>(() => ({
    queryKey: historyKeys.byDate(),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as string | undefined;
      const result = await call(
        apiClient.GET('/api/v1/history/sessions', {
          params: { query: cursor === undefined ? {} : { cursor } },
        }),
      );
      if (!result.ok) throw result.error;
      return { items: result.value.items, next: result.value.page_info.next_cursor ?? null };
    },
    getNextPageParam: (last) => last.next ?? undefined,
  }));
