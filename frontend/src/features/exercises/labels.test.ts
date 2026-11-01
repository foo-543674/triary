import { describe, expect, it } from 'vitest';
import { measurementSummary } from './labels';

describe('measurementSummary', () => {
  it('lists every measurement with whether it is required', () => {
    expect(
      measurementSummary([
        { kind: 'reps', required: true },
        { kind: 'weight', required: false },
      ]),
    ).toBe('回数 (必須)・重量 (任意)');
  });

  it('is empty for no measurements', () => {
    expect(measurementSummary([])).toBe('');
  });
});
