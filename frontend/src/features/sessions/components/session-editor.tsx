import { For, type JSX, Show } from 'solid-js';
import type { Exercise, Session } from '../../../api/client';
import { type DraftErrors, type DraftField, describeSet, type SetDraft } from '../set-draft';
import { SetForm } from './set-form';

type Props = {
  readonly session: Session;
  /** Exercises that can be added as a block. */
  readonly exercises: readonly Exercise[];
  readonly chosenExercise: string;
  readonly addingBlock: boolean;
  readonly blockError: string | undefined;
  readonly savingSet: boolean;
  readonly draft: (blockId: string) => SetDraft;
  readonly draftErrors: (blockId: string) => DraftErrors;
  readonly onChooseExercise: (id: string) => void;
  readonly onAddBlock: () => void;
  readonly onEditDraft: (blockId: string, field: DraftField, value: string) => void;
  readonly onAssisted: (blockId: string, assisted: boolean) => void;
  readonly onSaveSet: (blockId: string) => void;
  /** Extra controls rendered under the title (end, edit, delete, ...). */
  readonly actions?: JSX.Element;
};

/** Recording screen of one session: its blocks and sets (US-7). Fully controlled. */
export const SessionEditor = (props: Props): JSX.Element => (
  <article class="flex flex-col gap-6 py-6">
    <header>
      <h1 class="text-2xl font-bold text-gray-900">{props.session.workout_date} のトレーニング</h1>
      <p class="text-sm text-gray-500">{props.session.ended_at ? '終了済み' : '記録中'}</p>
      <Show when={props.session.note}>{(note) => <p class="mt-1 text-gray-700">{note()}</p>}</Show>
      {props.actions}
    </header>
    <For
      each={props.session.blocks}
      fallback={<p class="text-gray-500">種目を追加して記録を始めましょう</p>}
    >
      {(block) => (
        <section class="flex flex-col gap-2 rounded border border-gray-200 p-3">
          <h2 class="font-semibold text-gray-900">{block.exercise_name}</h2>
          <ol class="list-decimal pl-6 text-gray-800">
            <For each={block.sets}>{(set) => <li>{describeSet(set)}</li>}</For>
          </ol>
          <SetForm
            blockId={block.id}
            measurements={block.exercise_measurement_kinds}
            draft={props.draft(block.id)}
            errors={props.draftErrors(block.id)}
            saving={props.savingSet}
            onEdit={(field, value) => props.onEditDraft(block.id, field, value)}
            onAssisted={(assisted) => props.onAssisted(block.id, assisted)}
            onSave={() => props.onSaveSet(block.id)}
          />
        </section>
      )}
    </For>
    <form
      class="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        props.onAddBlock();
      }}
    >
      <label class="sr-only" for="block-exercise">
        追加する種目
      </label>
      <select
        id="block-exercise"
        class="rounded border border-gray-300 px-2 py-1"
        value={props.chosenExercise}
        onChange={(event) => props.onChooseExercise(event.currentTarget.value)}
      >
        <option value="">種目を選ぶ</option>
        <For each={props.exercises}>
          {(exercise) => <option value={exercise.id}>{exercise.name}</option>}
        </For>
      </select>
      <button
        type="submit"
        class="rounded border border-green-700 px-3 py-1 text-green-700 hover:bg-green-50 disabled:opacity-50"
        disabled={props.chosenExercise === '' || props.addingBlock}
      >
        種目を追加
      </button>
      <Show when={props.blockError}>
        {(message) => <p class="w-full text-sm text-red-600">{message()}</p>}
      </Show>
    </form>
  </article>
);
