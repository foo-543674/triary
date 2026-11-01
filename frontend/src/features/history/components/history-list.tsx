import { A } from '@solidjs/router';
import { For, type JSX, Show } from 'solid-js';
import type { SessionSummary } from '../../../api/client';

type Props = {
  readonly sessions: readonly SessionSummary[];
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly sessionPath: (id: string) => string;
  readonly onLoadMore: () => void;
};

/** Sessions by date, newest first (US-9). Fully controlled. */
export const HistoryList = (props: Props): JSX.Element => (
  <Show
    when={props.sessions.length > 0}
    fallback={
      <p class="py-6 text-gray-500">
        まだ記録がありません。トップの「トレーニング開始」から始めましょう
      </p>
    }
  >
    <ul class="divide-y divide-gray-200">
      <For each={props.sessions}>
        {(session) => (
          <li>
            <A
              class="flex flex-col gap-1 py-3 hover:bg-gray-50"
              href={props.sessionPath(session.id)}
            >
              <span class="flex items-center gap-2">
                <span class="font-semibold text-gray-900">{session.workout_date}</span>
                <span class="text-xs text-gray-500">
                  {session.block_count} 種目・{session.set_count} セット
                  {session.ended_at ? '' : '・記録中'}
                </span>
              </span>
              <span class="text-sm text-gray-700">
                {session.exercise_summary.map((e) => e.exercise_name).join('、') || '種目なし'}
              </span>
            </A>
          </li>
        )}
      </For>
    </ul>
    <Show when={props.hasMore}>
      <button
        type="button"
        class="mt-4 w-full rounded border border-gray-300 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        disabled={props.loadingMore}
        onClick={() => props.onLoadMore()}
      >
        {props.loadingMore ? '読み込み中…' : 'さらに表示'}
      </button>
    </Show>
  </Show>
);
