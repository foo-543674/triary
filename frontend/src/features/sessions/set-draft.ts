import type { Measurement, SetValues } from '../../api/client';

/**
 * A set being typed in: raw text per field, and whether the weight is
 * added load or assistance (US-7: the UI toggles the sign).
 */
export type SetDraft = {
  readonly reps: string;
  readonly weight: string;
  readonly assisted: boolean;
  readonly duration: string;
  readonly interval: string;
};

export const emptyDraft: SetDraft = {
  reps: '',
  weight: '',
  assisted: false,
  duration: '',
  interval: '',
};

export type DraftField = 'reps' | 'weight' | 'duration' | 'interval';

/** Problems found in the browser, keyed by the API field they belong to. */
export type DraftErrors = Readonly<Partial<Record<keyof SetValues | 'set', string>>>;

const INTEGER = /^\d+$/;
const DECIMAL = /^\d+(\.\d)?$/;

const integerOrNull = (text: string): number | null | 'invalid' => {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return INTEGER.test(trimmed) ? Number(trimmed) : 'invalid';
};

/**
 * Turns a draft into API values for an exercise with `measurements`, or the
 * reasons it cannot be sent. Mirrors the server's rules (out of range,
 * required measurement missing, nothing entered) so most mistakes never
 * leave the browser; the server stays the authority.
 */
export const toSetValues = (
  draft: SetDraft,
  measurements: readonly Measurement[],
):
  | { readonly ok: true; readonly values: SetValues }
  | { readonly ok: false; readonly errors: DraftErrors } => {
  const records = (kind: Measurement['kind']) => measurements.find((m) => m.kind === kind);
  const errors: Record<string, string> = {};
  const reps = records('reps') ? integerOrNull(draft.reps) : null;
  const duration = records('time') ? integerOrNull(draft.duration) : null;
  const interval = integerOrNull(draft.interval);
  const weightText = draft.weight.trim();
  const weight =
    !records('weight') || weightText === ''
      ? null
      : DECIMAL.test(weightText)
        ? (draft.assisted ? -1 : 1) * Number(weightText)
        : 'invalid';

  if (reps === 'invalid' || (typeof reps === 'number' && reps > 9999))
    errors.reps = '0〜9999 の整数で入力してください';
  if (duration === 'invalid' || (typeof duration === 'number' && duration > 86400))
    errors.duration_seconds = '0〜86400 秒の整数で入力してください';
  if (interval === 'invalid' || (typeof interval === 'number' && interval > 3600))
    errors.interval_seconds = '0〜3600 秒の整数で入力してください';
  if (weight === 'invalid' || (typeof weight === 'number' && (weight < -500 || weight > 999.9)))
    errors.weight_kg = '-500〜999.9 kg (0.1 kg 単位) で入力してください';

  const given = { reps: reps !== null, weight: weight !== null, time: duration !== null };
  for (const m of measurements) {
    if (m.required && !given[m.kind]) {
      const field =
        m.kind === 'reps' ? 'reps' : m.kind === 'weight' ? 'weight_kg' : 'duration_seconds';
      errors[field] ??= '必須の項目です';
    }
  }
  if (!given.reps && !given.weight && !given.time && Object.keys(errors).length === 0) {
    errors.set = '値を入力してください';
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    values: {
      reps: reps as number | null,
      weight_kg: weight as number | null,
      duration_seconds: duration as number | null,
      interval_seconds: interval as number | null,
    },
  };
};

/** "8 回 × 80.5 kg・休憩 120 秒" for showing a stored set. */
export const describeSet = (set: SetValues): string => {
  const parts = [
    set.reps != null ? `${set.reps} 回` : undefined,
    set.weight_kg != null
      ? set.weight_kg < 0
        ? `補助 ${-set.weight_kg} kg`
        : `${set.weight_kg} kg`
      : undefined,
    set.duration_seconds != null ? `${set.duration_seconds} 秒` : undefined,
  ].filter((part): part is string => part !== undefined);
  const main = parts.join(' × ');
  return set.interval_seconds != null ? `${main}・休憩 ${set.interval_seconds} 秒` : main;
};
