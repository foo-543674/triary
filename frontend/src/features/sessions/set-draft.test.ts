import { describe, expect, it } from 'vitest';
import type { Measurement } from '../../api/client';
import { describeSet, emptyDraft, toSetValues } from './set-draft';

const bench: Measurement[] = [
  { kind: 'reps', required: true },
  { kind: 'weight', required: true },
];
const pullUp: Measurement[] = [
  { kind: 'reps', required: true },
  { kind: 'weight', required: false },
];
const plank: Measurement[] = [{ kind: 'time', required: true }];

describe('toSetValues', () => {
  it('builds API values, with assistance as a negative weight', () => {
    expect(
      toSetValues(
        { ...emptyDraft, reps: '8', weight: '10.5', assisted: true, interval: '90' },
        pullUp,
      ),
    ).toEqual({
      ok: true,
      values: { reps: 8, weight_kg: -10.5, duration_seconds: null, interval_seconds: 90 },
    });
  });

  it('lets an optional measurement be left out', () => {
    expect(toSetValues({ ...emptyDraft, reps: '5' }, pullUp)).toEqual({
      ok: true,
      values: { reps: 5, weight_kg: null, duration_seconds: null, interval_seconds: null },
    });
  });

  it('asks for every required measurement', () => {
    expect(toSetValues({ ...emptyDraft, reps: '5' }, bench)).toEqual({
      ok: false,
      errors: { weight_kg: '必須の項目です' },
    });
  });

  it('refuses values outside the ranges and off the grid', () => {
    const result = toSetValues(
      { ...emptyDraft, reps: '10000', weight: '80.25', interval: '3601' },
      bench,
    );
    expect(result.ok).toBe(false);
    expect(Object.keys(result.ok ? {} : result.errors).sort()).toEqual([
      'interval_seconds',
      'reps',
      'weight_kg',
    ]);
  });

  it('refuses decimals for whole-number fields', () => {
    const result = toSetValues({ ...emptyDraft, duration: '30.5' }, plank);
    expect(result).toEqual({
      ok: false,
      errors: { duration_seconds: '0〜86400 秒の整数で入力してください' },
    });
  });

  it('treats a draft with nothing measured as empty, not as missing fields', () => {
    expect(toSetValues({ ...emptyDraft, interval: '60' }, pullUp)).toEqual({
      ok: false,
      errors: { reps: '必須の項目です' },
    });
    expect(toSetValues(emptyDraft, [{ kind: 'reps', required: false }])).toEqual({
      ok: false,
      errors: { set: '値を入力してください' },
    });
  });

  it('ignores fields the exercise does not record', () => {
    expect(toSetValues({ ...emptyDraft, duration: '30', reps: '3', weight: '5' }, bench)).toEqual({
      ok: true,
      values: { reps: 3, weight_kg: 5, duration_seconds: null, interval_seconds: null },
    });
  });
});

describe('describeSet', () => {
  it('reads like a log line', () => {
    expect(
      describeSet({ reps: 8, weight_kg: 80.5, duration_seconds: null, interval_seconds: 120 }),
    ).toBe('8 回 × 80.5 kg・休憩 120 秒');
    expect(
      describeSet({ reps: 5, weight_kg: -10, duration_seconds: null, interval_seconds: null }),
    ).toBe('5 回 × 補助 10 kg');
    expect(
      describeSet({ reps: null, weight_kg: null, duration_seconds: 60, interval_seconds: null }),
    ).toBe('60 秒');
  });
});
