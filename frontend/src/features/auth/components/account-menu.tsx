import { type JSX, Show } from 'solid-js';

type Props = {
  readonly userId: string;
  readonly signingOut: boolean;
  /** The last sign-out attempt failed (network or server error). */
  readonly signOutFailed: boolean;
  readonly onSignOut: () => void;
};

/** Who is signed in, with the sign-out action. */
export const AccountMenu = (props: Props): JSX.Element => (
  <div class="flex items-center gap-3 text-sm">
    <span class="text-gray-700">{props.userId}</span>
    <button
      type="button"
      class="rounded border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
      disabled={props.signingOut}
      onClick={() => props.onSignOut()}
    >
      ログアウト
    </button>
    <Show when={props.signOutFailed}>
      <span role="alert" class="text-red-600">
        ログアウトできませんでした
      </span>
    </Show>
  </div>
);
