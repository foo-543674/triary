import '@testing-library/jest-dom/vitest';
import { cleanup } from '@solidjs/testing-library';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '../mocks/server';

// NOTE: Wire up the standard MSW lifecycle hooks so handlers cannot leak
//       between tests.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
