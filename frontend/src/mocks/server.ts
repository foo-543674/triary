import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * MSW server for the Node-side test environment (vitest).
 *
 * `src/test/setup.ts` wires up start / reset / close lifecycle hooks so that
 * every test runs with MSW enabled by default.
 */
export const server = setupServer(...handlers);
