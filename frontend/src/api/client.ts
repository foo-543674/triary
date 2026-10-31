import createClient from 'openapi-fetch';
import type { paths } from './schema.gen';

/**
 * API client typed against the OpenAPI schema (`openapi/openapi.yaml`).
 *
 * The type definitions are produced by `pnpm run api:generate` into
 * `src/api/schema.gen.ts`. The generated file is committed; do not edit it
 * by hand.
 *
 * Requests go to the page's own origin by default: the session cookie is
 * `SameSite=Lax` and the app assumes same-origin delivery
 * (`.contexts/architecture.md` "配信トポロジの前提"). In development the
 * Vite dev server proxies `/api`, `/web` and `/health` to the backend
 * (`vite.config.ts`). `VITE_API_BASE_URL` overrides the origin.
 */
export const apiClient = createClient<paths>({
  // An absolute origin rather than '': fetch outside a browser page (vitest)
  // cannot resolve relative URLs.
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? globalThis.location.origin,
  // Look fetch up on every call: openapi-fetch otherwise keeps the one that
  // existed at import time, which bypassed MSW's interceptor in tests
  // (observed: "fetch failed" against a mocked /health).
  fetch: (request) => globalThis.fetch(request),
});
