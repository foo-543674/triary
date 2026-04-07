import { QueryClient } from '@tanstack/solid-query';

/**
 * アプリケーション全体で共有する TanStack Query の QueryClient。
 *
 * - `staleTime` はデフォルト 30 秒。筋トレ記録という性質上、
 *   リアルタイム性は高くないが古すぎる値を掴み続けたくないので中庸に設定。
 * - `refetchOnWindowFocus` は切っておく (PWA でバックグラウンドから戻るたびに
 *   不要な fetch を走らせない)。
 * - エラー再試行は 1 回まで (ネットワーク瞬断の救済のみを狙う)。
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
