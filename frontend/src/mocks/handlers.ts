import { HttpResponse, http } from 'msw';

/**
 * Mock Service Worker のリクエストハンドラ。
 *
 * - vitest のコンポーネントテストでは `src/mocks/server.ts` から使う。
 * - Storybook からは `src/mocks/browser.ts` 経由で使う。
 * - 実サーバに投げたいケースでは個別テスト内で `server.use(...)` で上書きする。
 *
 * 現状は `/health` の正常応答だけを返す最小構成。機能追加のたびに増やしていく。
 */
export const handlers = [http.get('*/health', () => HttpResponse.json({ status: 'ok' }))];
