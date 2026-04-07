import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/**
 * ブラウザ環境 (Storybook / PWA のモックモード) 用の MSW Worker。
 *
 * Storybook からは `.storybook/preview.ts` でこの worker を起動する想定。
 * 使う前に `pnpm exec msw init public/ --save` で `public/mockServiceWorker.js` を
 * 生成しておく必要がある (初回のみ)。
 */
export const worker = setupWorker(...handlers);
