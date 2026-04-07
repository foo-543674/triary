import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/**
 * MSW worker for the browser environment (Storybook, or PWA mock mode).
 *
 * `.storybook/preview.ts` is expected to start this worker. Before using it
 * for the first time, run `pnpm exec msw init public/ --save` to drop
 * `public/mockServiceWorker.js` into place.
 */
export const worker = setupWorker(...handlers);
