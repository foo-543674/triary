import { type ApiError, toApiError } from '../lib/api-error';

/** Outcome of one API call: the typed body, or the parsed error envelope. */
export type ApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApiError };

/** The shape openapi-fetch resolves every request to. */
type FetchOutcome<T> = { data?: T; error?: unknown; response: Response };

/**
 * Turns an `apiClient` request into an {@link ApiResult}. A network failure
 * (no response at all) becomes status 0 with code `network_error`, so
 * callers handle every failure the same way. A success without a body
 * (204) yields `undefined`.
 */
export const call = async <T>(request: Promise<FetchOutcome<T>>): Promise<ApiResult<T>> => {
  try {
    const { data, error, response } = await request;
    return response.ok
      ? { ok: true, value: data as T }
      : { ok: false, error: toApiError(response.status, error) };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Network error';
    return { ok: false, error: { status: 0, errors: [{ code: 'network_error', message }] } };
  }
};
