import createClient from 'openapi-fetch';
import type { components, paths } from './schema.gen';

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

/*
 * Domain shapes of the API, named for use outside `src/api/` (the generated
 * file may only be imported here; .dependency-cruiser.cjs).
 */
export type Exercise = components['schemas']['Exercise'];
export type ExerciseDetail = components['schemas']['ExerciseDetail'];
export type Measurement = components['schemas']['Measurement'];
export type MeasurementKind = components['schemas']['MeasurementKind'];
export type Session = components['schemas']['Session'];
export type ExerciseBlock = components['schemas']['ExerciseBlock'];
export type WorkoutSet = components['schemas']['WorkoutSet'];
export type SetValues = components['schemas']['SetValues'];
export type SessionSummary = components['schemas']['SessionSummary'];
