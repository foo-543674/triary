import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import App from './App';

/**
 * Smoke test for the App shell. Confirms that the top-level component
 * (which composes `Router` and `QueryClientProvider`) mounts without
 * throwing.
 *
 * Per-route assertions live in `routes/*.test.tsx` instead. Rendering the
 * full App here would force this file to register MSW handlers as soon as
 * any route starts fetching, which leaks responsibility into the wrong file.
 */
describe('App', () => {
  it('mounts without throwing', () => {
    expect(() => render(() => <App />)).not.toThrow();
  });
});
