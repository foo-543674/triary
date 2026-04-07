import { HttpResponse, http } from 'msw';

/**
 * Mock Service Worker request handlers.
 *
 * - Used by `src/mocks/server.ts` for vitest component tests.
 * - Used by `src/mocks/browser.ts` for Storybook (and PWA mock mode).
 * - When a specific test needs to talk to a real backend, override on the fly
 *   with `server.use(...)` inside that test.
 *
 * The current set is intentionally minimal: only `/health` is mocked. Add
 * more handlers as new features land.
 */
export const handlers = [http.get('*/health', () => HttpResponse.json({ status: 'ok' }))];
