import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * Node 環境 (vitest) 用の MSW サーバ。
 *
 * `src/test/setup.ts` から start / reset / close をフックしており、
 * 各テストは MSW が有効な状態で実行される。
 */
export const server = setupServer(...handlers);
