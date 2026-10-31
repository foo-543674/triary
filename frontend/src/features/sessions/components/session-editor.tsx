import { For, type JSX, Show } from 'solid-js';
import type { Exercise, Session, WorkoutSet } from '../../../api/client';
import { type DraftErrors, type DraftField, describeSet, type SetDraft } from '../set-draft';
import { ConfirmButton } from './confirm-button';
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
  readonly editingSet: (blockId: string) => string | undefined;
  /** ID of the block or set waiting for a second delete press. */
  readonly confirming: string | undefined;
  readonly onChooseExercise: (id: string) => void;
  readonly onAddBlock: () => void;
  readonly onEditDraft: (blockId: string, field: DraftField, value: string) => void;
  readonly onAssisted: (blockId: string, assisted: boolean) => void;
  readonly onSaveSet: (blockId: string) => void;
  readonly onEditSet: (blockId: string, set: WorkoutSet) => void;
  readonly onCancelEdit: (blockId: string) => void;
  readonly onMoveSet: (setId: string, order: number) => void;
  readonly onMoveBlock: (blockId: string, order: number) => void;
  readonly onAskConfirm: (id: string | undefined) => void;
  readonly onDeleteSet: (setId: string) => void;
  readonly onDeleteBlock: (blockId: string) => void;
  /** Rendered above the blocks: date, note, session actions. */
  readonly header: JSX.Element;
};

const SmallButton = (props: {
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    class="rounded px-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:invisible"
    title={props.title}
    aria-label={props.title}
    disabled={props.disabled}
    onClick={() => props.onClick()}
  >
    {props.label}
  </button>
);

/** Recording / editing screen of one session (US-7, US-8). Fully controlled. */
export const SessionEditor = (props: Props): JSX.Element => (
  <article class="flex flex-col gap-6 py-6">
    {props.header}
    <For
      each={props.session.blocks}
      fallback={<p class="text-gray-500">種目を追加して記録を始めましょう</p>}
    >
      {(block, blockIndex) => (
        <section class="flex flex-col gap-2 rounded border border-gray-200 p-3">
          <div class="flex items-center gap-2">
            <h2 class="flex-1 font-semibold text-gray-900">{block.exercise_name}</h2>
            <SmallButton
              label="↑"
              title="ブロックを上へ"
              disabled={blockIndex() === 0}
              onClick={() => props.onMoveBlock(block.id, blockIndex() - 1)}
            />
            <SmallButton
              label="↓"
              title="ブロックを下へ"
              disabled={blockIndex() === props.session.blocks.length - 1}
              onClick={() => props.onMoveBlock(block.id, blockIndex() + 1)}
            />
            <ConfirmButton
              label="削除"
              confirming={props.confirming === block.id}
              onAsk={() => props.onAskConfirm(block.id)}
              onConfirm={() => props.onDeleteBlock(block.id)}
              onCancel={() => props.onAskConfirm(undefined)}
            />
          </div>
          <ol class="flex flex-col gap-1 text-gray-800">
            <For each={block.sets}>
              {(set, setIndex) => (
                <li class="flex items-center gap-2">
                  <span class="w-6 text-right text-gray-500">{setIndex() + 1}.</span>
                  <span class="flex-1">{describeSet(set)}</span>
                  <SmallButton
                    label="↑"
                    title="セットを上へ"
                    disabled={setIndex() === 0}
                    onClick={() => props.onMoveSet(set.id, setIndex() - 1)}
                  />
                  <SmallButton
                    label="↓"
                    title="セットを下へ"
                    disabled={setIndex() === block.sets.length - 1}
                    onClick={() => props.onMoveSet(set.id, setIndex() + 1)}
                  />
                  <button
                    type="button"
                    class="text-sm text-green-700 hover:underline"
                    onClick={() => props.onEditSet(block.id, set)}
                  >
                    編集
                  </button>
                  <ConfirmButton
                    label="削除"
                    confirming={props.confirming === set.id}
                    onAsk={() => props.onAskConfirm(set.id)}
                    onConfirm={() => props.onDeleteSet(set.id)}
                    onCancel={() => props.onAskConfirm(undefined)}
                  />
                </li>
              )}
            </For>
          </ol>
          <SetForm
            blockId={block.id}
            measurements={block.exercise_measurement_kinds}
            draft={props.draft(block.id)}
            errors={props.draftErrors(block.id)}
            saving={props.savingSet}
            editing={props.editingSet(block.id) !== undefined}
            onCancel={() => props.onCancelEdit(block.id)}
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
