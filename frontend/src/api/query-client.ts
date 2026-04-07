import { QueryClient } from '@tanstack/solid-query';

/**
 * QueryClient shared across the whole TanStack Query tree.
 *
 * Defaults are tuned for triary specifically:
 * - `staleTime` is 30 seconds. Workout logs do not need realtime freshness,
 *   but we also do not want callers to keep stale data around for too long.
 * - `refetchOnWindowFocus` is disabled so that returning to the PWA from
 *   the background does not trigger needless network traffic.
 * - Query retries are capped at 1 to recover from a transient blip without
 *   masking real failures.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
