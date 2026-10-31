import { type Accessor, createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { type DraftErrors, type DraftField, emptyDraft, type SetDraft } from '../set-draft';

/**
 * Screen state of the session editor: the exercise chosen for the next
 * block, and per block the set being typed with its errors.
 */
export type SessionEditorState = {
  readonly chosenExercise: Accessor<string>;
  readonly chooseExercise: (id: string) => void;
  readonly draft: (blockId: string) => SetDraft;
  readonly editDraft: (blockId: string, field: DraftField, value: string) => void;
  readonly setAssisted: (blockId: string, assisted: boolean) => void;
  readonly errors: (blockId: string) => DraftErrors;
  readonly showErrors: (blockId: string, errors: DraftErrors) => void;
  /** After a set was saved: an empty form, but the same interval and assistance as before. */
  readonly resetDraft: (blockId: string) => void;
};

export const createSessionEditorState = (): SessionEditorState => {
  const [chosenExercise, chooseExercise] = createSignal('');
  const [drafts, setDrafts] = createStore<Record<string, SetDraft>>({});
  const [errors, setErrors] = createStore<Record<string, DraftErrors>>({});
  const draft = (blockId: string) => drafts[blockId] ?? emptyDraft;
  return {
    chosenExercise,
    chooseExercise,
    draft,
    editDraft: (blockId, field, value) => {
      setDrafts(blockId, { ...draft(blockId), [field]: value });
      setErrors(blockId, reconcile({}));
    },
    setAssisted: (blockId, assisted) => setDrafts(blockId, { ...draft(blockId), assisted }),
    errors: (blockId) => errors[blockId] ?? {},
    // reconcile replaces; a plain object would be merged into the old errors.
    showErrors: (blockId, found) => setErrors(blockId, reconcile(found)),
    resetDraft: (blockId) => {
      const previous = draft(blockId);
      setDrafts(blockId, {
        ...emptyDraft,
        interval: previous.interval,
        assisted: previous.assisted,
      });
      setErrors(blockId, {});
    },
  };
};
