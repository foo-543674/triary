import { type JSX, Match, Switch } from 'solid-js';
import type { ApiError } from '../../../lib/api-error';
import { SessionEditor } from '../components/session-editor';
import { SessionHeader } from '../components/session-header';
import { createAppendBlockMutation } from '../mutations/append-block';
import { createAppendSetMutation } from '../mutations/append-set';
import { createDeleteBlockMutation } from '../mutations/delete-block';
import { createDeleteSessionMutation } from '../mutations/delete-session';
import { createDeleteSetMutation } from '../mutations/delete-set';
import { createEndSessionMutation } from '../mutations/end-session';
import { createMoveBlockMutation } from '../mutations/move-block';
import { createUpdateSessionMutation } from '../mutations/update-session';
import { createUpdateSetMutation } from '../mutations/update-set';
import { createExerciseChoicesQuery } from '../queries/exercise-choices';
import { createSessionQuery } from '../queries/session';
import { toSetValues } from '../set-draft';
import { createSessionEditorState } from '../state/session-editor';

type Props = { readonly sessionId: string; readonly onDeleted: () => void };

/** The server's field errors as form errors (wording is generic: the browser checks came first). */
const serverErrors = (error: ApiError) =>
  Object.fromEntries(
    error.errors.map((e) => [
      e.field ?? 'set',
      '保存できませんでした (入力内容を確認してください)',
    ]),
  );

/** Wires the recording / editing screen to the session query, mutations and state. */
export const SessionEditorContainer = (props: Props): JSX.Element => {
  const sessionId = () => props.sessionId;
  const session = createSessionQuery(sessionId);
  const exercises = createExerciseChoicesQuery();
  const editor = createSessionEditorState();
  const appendBlock = createAppendBlockMutation(sessionId);
  const appendSet = createAppendSetMutation(sessionId);
  const updateSet = createUpdateSetMutation(sessionId);
  const deleteSet = createDeleteSetMutation(sessionId);
  const moveBlock = createMoveBlockMutation(sessionId);
  const deleteBlock = createDeleteBlockMutation(sessionId);
  const updateSession = createUpdateSessionMutation(sessionId);
  const endSession = createEndSessionMutation(sessionId);
  const deleteSession = createDeleteSessionMutation(sessionId, {
    onSuccess: () => props.onDeleted(),
  });
  const headerError = () =>
    updateSession.isError || endSession.isError || deleteSession.isError
      ? '保存できませんでした'
      : undefined;
  return (
    <Switch>
      <Match when={session.isPending}>
        <p class="py-6 text-gray-500" role="status">
          読み込み中…
        </p>
      </Match>
      <Match when={session.isError}>
        <p class="py-6 text-red-600" role="alert">
          セッションを読み込めませんでした
        </p>
      </Match>
      <Match when={session.data === null}>
        <p class="py-6 text-gray-600">このセッションは見つかりません</p>
      </Match>
      <Match when={session.data}>
        {(data) => (
          <SessionEditor
            session={data()}
            header={
              <SessionHeader
                session={data()}
                draft={editor.header()}
                confirmingDelete={editor.confirming() === data().id}
                busy={updateSession.isPending || endSession.isPending}
                error={headerError()}
                onEdit={editor.editHeader}
                onSave={() => {
                  const draft = editor.header();
                  if (draft === undefined) return;
                  updateSession.mutate(
                    { workout_date: draft.date, note: draft.note === '' ? null : draft.note },
                    { onSuccess: () => editor.editHeader(undefined) },
                  );
                }}
                onEnd={() => endSession.mutate()}
                onAskDelete={(asking) => editor.askToConfirm(asking ? data().id : undefined)}
                onDelete={() => deleteSession.mutate()}
              />
            }
            exercises={exercises.data ?? []}
            chosenExercise={editor.chosenExercise()}
            addingBlock={appendBlock.isPending}
            blockError={appendBlock.isError ? '種目を追加できませんでした' : undefined}
            savingSet={appendSet.isPending || updateSet.isPending}
            draft={editor.draft}
            draftErrors={editor.errors}
            editingSet={editor.editingSet}
            confirming={editor.confirming()}
            onChooseExercise={editor.chooseExercise}
            onAddBlock={() =>
              appendBlock.mutate(
                { exercise_id: editor.chosenExercise() },
                { onSuccess: () => editor.chooseExercise('') },
              )
            }
            onEditDraft={editor.editDraft}
            onAssisted={editor.setAssisted}
            onSaveSet={(blockId) => {
              const block = data().blocks.find((b) => b.id === blockId);
              const checked = toSetValues(
                editor.draft(blockId),
                block?.exercise_measurement_kinds ?? [],
              );
              if (!checked.ok) {
                editor.showErrors(blockId, checked.errors);
                return;
              }
              const done = {
                onSuccess: () => editor.resetDraft(blockId),
                onError: (error: ApiError) => editor.showErrors(blockId, serverErrors(error)),
              };
              const editing = editor.editingSet(blockId);
              if (editing === undefined) {
                appendSet.mutate({ blockId, values: checked.values }, done);
              } else {
                updateSet.mutate({ setId: editing, values: checked.values }, done);
              }
            }}
            onEditSet={(blockId, set) => editor.startEditingSet(blockId, set.id, set)}
            onCancelEdit={editor.stopEditingSet}
            onMoveSet={(setId, order) => updateSet.mutate({ setId, order })}
            onMoveBlock={(blockId, order) => moveBlock.mutate({ blockId, order })}
            onAskConfirm={editor.askToConfirm}
            onDeleteSet={(setId) => {
              // Leave edit mode if the set being edited is the one deleted.
              const block = data().blocks.find((b) => b.sets.some((set) => set.id === setId));
              if (block !== undefined && editor.editingSet(block.id) === setId) {
                editor.stopEditingSet(block.id);
              }
              deleteSet.mutate(setId, { onSettled: () => editor.askToConfirm(undefined) });
            }}
            onDeleteBlock={(blockId) =>
              deleteBlock.mutate(blockId, { onSettled: () => editor.askToConfirm(undefined) })
            }
          />
        )}
      </Match>
    </Switch>
  );
};
