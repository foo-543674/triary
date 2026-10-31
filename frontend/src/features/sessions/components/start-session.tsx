import { type JSX, Show } from 'solid-js';

type Props = { readonly starting: boolean; readonly failed: boolean; readonly onStart: () => void };

/** "トレーニング開始" (US-7). */
export const StartSession = (props: Props): JSX.Element => (
  <div class="flex flex-col items-center gap-2">
    <button
      type="button"
      class="rounded bg-green-700 px-6 py-3 text-lg font-semibold text-white hover:bg-green-800 disabled:bg-gray-400"
      disabled={props.starting}
      onClick={() => props.onStart()}
    >
      トレーニング開始
    </button>
    <Show when={props.failed}>
      <p role="alert" class="text-sm text-red-600">
        開始できませんでした。もう一度お試しください
      </p>
    </Show>
  </div>
);
