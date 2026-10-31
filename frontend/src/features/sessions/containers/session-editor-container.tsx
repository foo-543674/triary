import { type JSX, Match, Switch } from 'solid-js';
import { SessionEditor } from '../components/session-editor';
import { createAppendBlockMutation } from '../mutations/append-block';
import { createAppendSetMutation } from '../mutations/append-set';
import { createExerciseChoicesQuery } from '../queries/exercise-choices';
import { createSessionQuery } from '../queries/session';
import { toSetValues } from '../set-draft';
import { createSessionEditorState } from '../state/session-editor';

type Props = { readonly sessionId: string; readonly actions?: JSX.Element };

/** Wires the recording screen to the session query, its mutations and state. */
export const SessionEditorContainer = (props: Props): JSX.Element => {
  const session = createSessionQuery(() => props.sessionId);
  const exercises = createExerciseChoicesQuery();
  const editor = createSessionEditorState();
  const appendBlock = createAppendBlockMutation(() => props.sessionId);
  const appendSet = createAppendSetMutation(() => props.sessionId);
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
            exercises={exercises.data ?? []}
            chosenExercise={editor.chosenExercise()}
            addingBlock={appendBlock.isPending}
            blockError={appendBlock.isError ? '種目を追加できませんでした' : undefined}
            savingSet={appendSet.isPending}
            draft={editor.draft}
            draftErrors={editor.errors}
            actions={props.actions}
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
              appendSet.mutate(
                { blockId, values: checked.values },
                {
                  onSuccess: () => editor.resetDraft(blockId),
                  onError: (error) =>
                    editor.showErrors(
                      blockId,
                      Object.fromEntries(
                        error.errors.map((e) => [
                          e.field ?? 'set',
                          '保存できませんでした (入力内容を確認してください)',
                        ]),
                      ),
                    ),
                },
              );
            }}
          />
        )}
      </Match>
    </Switch>
  );
};
