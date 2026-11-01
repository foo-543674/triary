import { type JSX, Show } from 'solid-js';
import type { Session } from '../../../api/client';
import { ConfirmButton } from './confirm-button';

export type HeaderDraft = { readonly date: string; readonly note: string };

type Props = {
  readonly session: Session;
  /** Date and note being edited; undefined when showing. */
  readonly draft: HeaderDraft | undefined;
  readonly confirmingDelete: boolean;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly onEdit: (draft: HeaderDraft | undefined) => void;
  readonly onSave: () => void;
  readonly onEnd: () => void;
  readonly onAskDelete: (asking: boolean) => void;
  readonly onDelete: () => void;
};

/** Date, note and the session-wide actions (US-7 end, US-8 edit / delete). */
export const SessionHeader = (props: Props): JSX.Element => (
  <header class="flex flex-col gap-2">
    <Show
      when={props.draft}
      fallback={
        <>
          <h1 class="text-2xl font-bold text-gray-900">
            {props.session.workout_date} のトレーニング
          </h1>
          <Show when={props.session.note}>{(note) => <p class="text-gray-700">{note()}</p>}</Show>
        </>
      }
    >
      {(draft) => (
        <form
          class="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSave();
          }}
        >
          <label class="flex flex-col text-xs text-gray-600">
            日付
            <input
              type="date"
              class="rounded border border-gray-300 px-2 py-1 text-sm"
              value={draft().date}
              onInput={(event) => props.onEdit({ ...draft(), date: event.currentTarget.value })}
            />
          </label>
          <label class="flex flex-1 flex-col text-xs text-gray-600">
            メモ
            <input
              class="rounded border border-gray-300 px-2 py-1 text-sm"
              value={draft().note}
              maxLength={2000}
              onInput={(event) => props.onEdit({ ...draft(), note: event.currentTarget.value })}
            />
          </label>
          <button
            type="submit"
            class="rounded bg-green-700 px-3 py-1 text-sm text-white"
            disabled={props.busy}
          >
            保存
          </button>
          <button
            type="button"
            class="text-sm text-gray-600 underline"
            onClick={() => props.onEdit(undefined)}
          >
            やめる
          </button>
        </form>
      )}
    </Show>
    <div class="flex flex-wrap items-center gap-4 text-sm">
      <span class="text-gray-500">{props.session.ended_at ? '終了済み' : '記録中'}</span>
      <Show when={!props.draft}>
        <button
          type="button"
          class="text-green-700 hover:underline"
          onClick={() =>
            props.onEdit({ date: props.session.workout_date, note: props.session.note ?? '' })
          }
        >
          日付・メモを編集
        </button>
      </Show>
      <Show when={!props.session.ended_at}>
        <button
          type="button"
          class="rounded border border-green-700 px-3 py-1 text-green-700 hover:bg-green-50 disabled:opacity-50"
          disabled={props.busy}
          onClick={() => props.onEnd()}
        >
          セッション終了
        </button>
      </Show>
      <ConfirmButton
        label="セッションを削除"
        confirming={props.confirmingDelete}
        onAsk={() => props.onAskDelete(true)}
        onConfirm={() => props.onDelete()}
        onCancel={() => props.onAskDelete(false)}
      />
    </div>
    <Show when={props.error}>
      {(message) => (
        <p role="alert" class="text-sm text-red-600">
          {message()}
        </p>
      )}
    </Show>
  </header>
);
