import { type Accessor, createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import type { SetValues } from '../../../api/client';
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
  /** The set whose values the block's form is editing, if any. */
  readonly editingSet: (blockId: string) => string | undefined;
  readonly startEditingSet: (blockId: string, setId: string, values: SetValues) => void;
  readonly stopEditingSet: (blockId: string) => void;
  /** The item (session, block or set ID) waiting for a second press to be deleted. */
  readonly confirming: Accessor<string | undefined>;
  readonly askToConfirm: (id: string | undefined) => void;
  /** Header form: date and note being edited, or undefined when not editing. */
  readonly header: Accessor<{ readonly date: string; readonly note: string } | undefined>;
  readonly editHeader: (
    header: { readonly date: string; readonly note: string } | undefined,
  ) => void;
};

export const createSessionEditorState = (): SessionEditorState => {
  const [chosenExercise, chooseExercise] = createSignal('');
  const [drafts, setDrafts] = createStore<Record<string, SetDraft>>({});
  const [errors, setErrors] = createStore<Record<string, DraftErrors>>({});
  const [editing, setEditing] = createStore<Record<string, string | undefined>>({});
  const [confirming, askToConfirm] = createSignal<string | undefined>();
  const [header, editHeader] = createSignal<
    { readonly date: string; readonly note: string } | undefined
  >();
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
      setErrors(blockId, reconcile({}));
      setEditing(blockId, undefined);
    },
    editingSet: (blockId) => editing[blockId],
    startEditingSet: (blockId, setId, values) => {
      const text = (value: number | null | undefined) => (value == null ? '' : String(value));
      setDrafts(blockId, {
        reps: text(values.reps),
        weight: values.weight_kg == null ? '' : String(Math.abs(values.weight_kg)),
        assisted: (values.weight_kg ?? 0) < 0,
        duration: text(values.duration_seconds),
        interval: text(values.interval_seconds),
      });
      setErrors(blockId, reconcile({}));
      setEditing(blockId, setId);
    },
    stopEditingSet: (blockId) => {
      setEditing(blockId, undefined);
      setDrafts(blockId, emptyDraft);
      setErrors(blockId, reconcile({}));
    },
    confirming,
    askToConfirm,
    header,
    editHeader,
  };
};
