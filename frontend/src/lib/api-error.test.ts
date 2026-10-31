import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { codesForField, generalErrors, isUnauthenticated, toApiError } from './api-error';

describe('toApiError', () => {
  it('keeps every item of a well-formed envelope', () => {
    const error = toApiError(400, {
      errors: [
        { code: 'too_long', field: 'name', message: 'Too long' },
        { code: 'invalid_charset', field: 'name', message: 'Bad' },
        { code: 'too_short', field: 'password', message: 'Too short' },
      ],
    });
    expect(error.status).toBe(400);
    expect(codesForField(error, 'name')).toEqual(['too_long', 'invalid_charset']);
    expect(codesForField(error, 'password')).toEqual(['too_short']);
    expect(generalErrors(error)).toEqual([]);
  });

  it('treats items without field as general errors', () => {
    const error = toApiError(404, {
      errors: [{ code: 'not_found', message: 'Exercise not found' }],
    });
    expect(generalErrors(error)).toEqual([{ code: 'not_found', message: 'Exercise not found' }]);
  });

  it.each([
    ['null body', null],
    ['plain text', 'Internal Server Error'],
    ['empty list', { errors: [] }],
    ['single-error object', { error: 'not_found', message: 'x' }],
    ['items without code', { errors: [{ message: 'x' }] }],
  ])('falls back to one unknown item for %s', (_, body) => {
    const error = toApiError(502, body);
    expect(error.errors).toEqual([{ code: 'unknown', message: 'HTTP 502' }]);
  });

  test.prop([fc.integer({ min: 100, max: 599 }), fc.anything()])(
    'never throws and always yields at least one item',
    (status, body) => {
      const error = toApiError(status, body);
      expect(error.errors.length).toBeGreaterThanOrEqual(1);
      expect(error.status).toBe(status);
    },
  );
});

describe('isUnauthenticated', () => {
  it('is true only for 401 with the unauthenticated code', () => {
    expect(
      isUnauthenticated(toApiError(401, { errors: [{ code: 'unauthenticated', message: '' }] })),
    ).toBe(true);
    expect(
      isUnauthenticated(
        toApiError(401, { errors: [{ code: 'invalid_credentials', message: '' }] }),
      ),
    ).toBe(false);
    expect(
      isUnauthenticated(toApiError(400, { errors: [{ code: 'unauthenticated', message: '' }] })),
    ).toBe(false);
  });
});
