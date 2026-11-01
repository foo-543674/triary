import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { toLocalDate } from './date';

describe('toLocalDate', () => {
  it('formats the local calendar day with zero padding', () => {
    expect(toLocalDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(toLocalDate(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });

  test.prop([
    fc.date({ min: new Date(1000, 0, 1), max: new Date(9999, 11, 31), noInvalidDate: true }),
  ])('round-trips through the local date constructor', (instant) => {
    const [year, month, day] = toLocalDate(instant).split('-').map(Number);
    expect([year, month, day]).toEqual([
      instant.getFullYear(),
      instant.getMonth() + 1,
      instant.getDate(),
    ]);
  });
});
