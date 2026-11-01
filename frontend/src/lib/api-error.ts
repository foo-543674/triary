/**
 * Reading the API's error envelope (`ErrorEnvelope` in `openapi/openapi.yaml`,
 * `.contexts/api-design.md` §1.6): every error response is
 * `{ errors: [{ code, field?, message }] }` with at least one item.
 *
 * Pure functions only; they never throw on unexpected input. Anything that is
 * not a well-formed envelope becomes a single `unknown` item so callers can
 * always show something.
 */

export type ApiErrorItem = {
  readonly code: string;
  readonly field?: string;
  readonly message: string;
};

export type ApiError = {
  readonly status: number;
  readonly errors: readonly [ApiErrorItem, ...ApiErrorItem[]];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toItem = (value: unknown): ApiErrorItem | undefined => {
  if (!isRecord(value) || typeof value.code !== 'string') {
    return undefined;
  }
  const message = typeof value.message === 'string' ? value.message : '';
  return typeof value.field === 'string'
    ? { code: value.code, field: value.field, message }
    : { code: value.code, message };
};

/** Builds an {@link ApiError} from a response status and its parsed body. */
export const toApiError = (status: number, body: unknown): ApiError => {
  const items =
    isRecord(body) && Array.isArray(body.errors)
      ? body.errors.map(toItem).filter((item): item is ApiErrorItem => item !== undefined)
      : [];
  const [first, ...rest] = items;
  return first === undefined
    ? { status, errors: [{ code: 'unknown', message: `HTTP ${status}` }] }
    : { status, errors: [first, ...rest] };
};

/** Codes reported for one input field, in response order. */
export const codesForField = (error: ApiError, field: string): readonly string[] =>
  error.errors.filter((item) => item.field === field).map((item) => item.code);

/** Items that are not about a particular input field. */
export const generalErrors = (error: ApiError): readonly ApiErrorItem[] =>
  error.errors.filter((item) => item.field === undefined);

/** True when the response says the session is missing or no longer valid. */
export const isUnauthenticated = (error: ApiError): boolean =>
  error.status === 401 && error.errors.some((item) => item.code === 'unauthenticated');
