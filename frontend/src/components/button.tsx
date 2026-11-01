import type { JSX } from 'solid-js';

type Props = {
  readonly label: string;
  readonly type?: 'button' | 'submit';
  readonly disabled?: boolean;
  readonly onClick?: () => void;
};

/** Primary action button. Hover / focus / disabled looks are CSS only. */
export const Button = (props: Props): JSX.Element => (
  <button
    type={props.type ?? 'button'}
    disabled={props.disabled}
    onClick={() => props.onClick?.()}
    class="rounded bg-green-700 px-4 py-2 font-semibold text-white hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-300 disabled:cursor-not-allowed disabled:bg-gray-400"
  >
    {props.label}
  </button>
);
