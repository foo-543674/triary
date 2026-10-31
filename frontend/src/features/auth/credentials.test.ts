import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { handleErrors, passwordErrors } from './credentials';

describe('handleErrors', () => {
  it.each([
    ['ab', ['too_short']],
    ['abc', []],
    ['a'.repeat(32), []],
    ['a'.repeat(33), ['too_long']],
    ['bad handle', ['invalid_charset']],
    ['Admin', ['reserved']],
    ['_x-', []],
    ['あい', ['too_short', 'invalid_charset']],
  ])('%s → %j', (raw, expected) => {
    expect(handleErrors(raw)).toEqual(expected);
  });

  test.prop([fc.stringMatching(/^[A-Za-z0-9_-]{3,32}$/)])(
    'accepts every well-formed handle that is not reserved',
    (raw) => {
      const errors = handleErrors(raw);
      expect(errors.length === 0 || (errors.length === 1 && errors[0] === 'reserved')).toBe(true);
    },
  );
});

describe('passwordErrors', () => {
  it.each([
    [11, ['too_short']],
    [12, []],
    [128, []],
    [129, ['too_long']],
  ])('%i characters → %j', (length, expected) => {
    expect(passwordErrors('p'.repeat(length))).toEqual(expected);
  });

  it('counts characters, not UTF-16 units', () => {
    expect(passwordErrors('😀'.repeat(12))).toEqual([]);
    expect(passwordErrors('😀'.repeat(11))).toEqual(['too_short']);
  });
});
