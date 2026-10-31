import { type JSX, Show } from 'solid-js';
import type { Measurement } from '../../../api/client';
import type { DraftErrors, DraftField, SetDraft } from '../set-draft';

type Props = {
  readonly blockId: string;
  readonly measurements: readonly Measurement[];
  readonly draft: SetDraft;
  readonly errors: DraftErrors;
  readonly saving: boolean;
  readonly onEdit: (field: DraftField, value: string) => void;
  readonly onAssisted: (assisted: boolean) => void;
  readonly onSave: () => void;
};

const NumberInput = (props: {
  id: string;
  label: string;
  unit: string;
  value: string;
  error: string | undefined;
  required: boolean;
  onInput: (value: string) => void;
}) => (
  <label class="flex flex-col text-xs text-gray-600" for={props.id}>
    <span>
      {props.label}
      {props.required ? ' *' : ''}
    </span>
    <span class="flex items-center gap-1">
      <input
        id={props.id}
        class="w-20 rounded border border-gray-300 px-2 py-1 text-sm aria-[invalid=true]:border-red-500"
        inputmode="decimal"
        value={props.value}
        aria-invalid={props.error !== undefined}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
      <span>{props.unit}</span>
    </span>
    <Show when={props.error}>{(message) => <span class="text-red-600">{message()}</span>}</Show>
  </label>
);

/** Inputs for one set, shaped by the exercise's measurements (US-7). */
export const SetForm = (props: Props): JSX.Element => {
  const has = (kind: Measurement['kind']) => props.measurements.find((m) => m.kind === kind);
  const id = (field: string) => `${props.blockId}-${field}`;
  return (
    <form
      class="flex flex-wrap items-end gap-3 rounded bg-gray-50 p-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        props.onSave();
      }}
    >
      <Show when={has('reps')}>
        {(m) => (
          <NumberInput
            id={id('reps')}
            label="回数"
            unit="回"
            value={props.draft.reps}
            error={props.errors.reps}
            required={m().required}
            onInput={(v) => props.onEdit('reps', v)}
          />
        )}
      </Show>
      <Show when={has('weight')}>
        {(m) => (
          <div class="flex items-end gap-1">
            <NumberInput
              id={id('weight')}
              label="重量"
              unit="kg"
              value={props.draft.weight}
              error={props.errors.weight_kg}
              required={m().required}
              onInput={(v) => props.onEdit('weight', v)}
            />
            <label class="flex items-center gap-1 pb-1 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={props.draft.assisted}
                onChange={(event) => props.onAssisted(event.currentTarget.checked)}
              />
              補助
            </label>
          </div>
        )}
      </Show>
      <Show when={has('time')}>
        {(m) => (
          <NumberInput
            id={id('duration')}
            label="時間"
            unit="秒"
            value={props.draft.duration}
            error={props.errors.duration_seconds}
            required={m().required}
            onInput={(v) => props.onEdit('duration', v)}
          />
        )}
      </Show>
      <NumberInput
        id={id('interval')}
        label="休憩"
        unit="秒"
        value={props.draft.interval}
        error={props.errors.interval_seconds}
        required={false}
        onInput={(v) => props.onEdit('interval', v)}
      />
      <button
        type="submit"
        class="rounded bg-green-700 px-3 py-1 text-sm font-semibold text-white hover:bg-green-800 disabled:bg-gray-400"
        disabled={props.saving}
      >
        セットを追加
      </button>
      <Show when={props.errors.set}>
        {(message) => <p class="w-full text-sm text-red-600">{message()}</p>}
      </Show>
    </form>
  );
};
