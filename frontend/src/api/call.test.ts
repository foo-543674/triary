import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../mocks/server';
import { call } from './call';
import { apiClient } from './client';

describe('call', () => {
  it('returns the typed body of a success', async () => {
    const result = await call(apiClient.GET('/health'));
    expect(result).toEqual({ ok: true, value: { status: 'ok' } });
  });

  it('parses the error envelope of a failure', async () => {
    server.use(
      http.get('*/health', () =>
        HttpResponse.json(
          { errors: [{ code: 'internal_error', message: 'Internal server error' }] },
          { status: 500 },
        ),
      ),
    );
    const result = await call(apiClient.GET('/health'));
    expect(result).toEqual({
      ok: false,
      error: {
        status: 500,
        errors: [{ code: 'internal_error', message: 'Internal server error' }],
      },
    });
  });

  it('turns a network failure into status 0', async () => {
    server.use(http.get('*/health', () => HttpResponse.error()));
    const result = await call(apiClient.GET('/health'));
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.status).toBe(0);
    expect(result.ok ? undefined : result.error.errors[0].code).toBe('network_error');
  });
});
