import { type JSX, Show } from 'solid-js';

type Props = {
  readonly label: string;
  /** This button's item is the one waiting for confirmation. */
  readonly confirming: boolean;
  readonly onAsk: () => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

/** A delete button that needs a second press (US-8: deletion is confirmed). */
export const ConfirmButton = (props: Props): JSX.Element => (
  <Show
    when={props.confirming}
    fallback={
      <button
        type="button"
        class="text-sm text-red-700 hover:underline"
        onClick={() => props.onAsk()}
      >
        {props.label}
      </button>
    }
  >
    <span class="flex items-center gap-2 text-sm">
      <button
        type="button"
        class="rounded bg-red-700 px-2 py-0.5 font-semibold text-white"
        onClick={() => props.onConfirm()}
      >
        本当に{props.label}
      </button>
      <button type="button" class="text-gray-600 underline" onClick={() => props.onCancel()}>
        やめる
      </button>
    </span>
  </Show>
);
