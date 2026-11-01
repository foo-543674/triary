import { renderHook, waitFor } from '@solidjs/testing-library';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { HttpResponse, http } from 'msw';
import type { JSX } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { createSessionsByDateQuery } from './queries/sessions-by-date';

const summary = (id: string, date: string) => ({
  id,
  workout_date: date,
  started_at: `${date}T09:00:00Z`,
  ended_at: null,
  block_count: 0,
  set_count: 0,
  exercise_summary: [],
});

describe('createSessionsByDateQuery', () => {
  it('follows next_cursor page by page and stops on the last page', async () => {
    const seenCursors: (string | null)[] = [];
    server.use(
      http.get('*/api/v1/history/sessions', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        seenCursors.push(cursor);
        return cursor === null
          ? HttpResponse.json({
              items: [summary('ses_a', '2026-10-31')],
              page_info: { next_cursor: 'c2', has_next: true },
            })
          : HttpResponse.json({
              items: [summary('ses_b', '2026-10-30')],
              page_info: { next_cursor: null, has_next: false },
            });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = (props: { children: JSX.Element }) => (
      <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
    );
    const { result } = renderHook(createSessionsByDateQuery, { wrapper });
    await waitFor(() => expect(result.isSuccess).toBe(true));
    expect(result.hasNextPage).toBe(true);
    await result.fetchNextPage();
    await waitFor(() => expect(result.data?.pages.length).toBe(2));
    expect(result.data?.pages.flatMap((p) => p.items.map((i) => i.id))).toEqual(['ses_a', 'ses_b']);
    expect(result.hasNextPage).toBe(false);
    expect(seenCursors).toEqual([null, 'c2']);
  });
});
