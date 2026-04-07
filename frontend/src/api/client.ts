import createClient from 'openapi-fetch';
import type { paths } from './schema.gen';

/**
 * API client typed against the OpenAPI schema (`openapi/openapi.yaml`).
 *
 * The type definitions are produced by `pnpm run api:generate` into
 * `src/api/schema.gen.ts`. The generated file is committed; do not edit it
 * by hand.
 */
export const apiClient = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080',
});
