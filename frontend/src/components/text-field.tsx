import { For, type JSX, Show } from 'solid-js';

type Props = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onInput: (value: string) => void;
  readonly type?: 'text' | 'password';
  readonly autocomplete?: string;
  /** Messages to show under the field; non-empty marks it invalid. */
  readonly errors?: readonly string[];
  readonly hint?: string;
};

/** Labelled text input with its error messages. Fully controlled. */
export const TextField = (props: Props): JSX.Element => {
  const errorId = () => `${props.id}-errors`;
  const invalid = () => (props.errors?.length ?? 0) > 0;
  return (
    <div class="flex flex-col gap-1">
      <label class="text-sm font-medium text-gray-700" for={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        class="rounded border border-gray-300 px-3 py-2 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-200 aria-[invalid=true]:border-red-500"
        type={props.type ?? 'text'}
        value={props.value}
        autocomplete={props.autocomplete}
        aria-invalid={invalid()}
        aria-describedby={invalid() ? errorId() : undefined}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
      <Show when={props.hint !== undefined && !invalid()}>
        <p class="text-xs text-gray-500">{props.hint}</p>
      </Show>
      <Show when={invalid()}>
        <ul id={errorId()} class="text-sm text-red-600">
          <For each={props.errors}>{(message) => <li>{message}</li>}</For>
        </ul>
      </Show>
    </div>
  );
};
