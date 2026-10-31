import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { emptyDraft } from '../set-draft';
import { createSessionEditorState } from './session-editor';

describe('createSessionEditorState', () => {
  it('keeps one draft per block and clears errors on edit', () =>
    createRoot((dispose) => {
      const state = createSessionEditorState();
      state.editDraft('a', 'reps', '8');
      state.showErrors('a', { reps: 'x' });
      expect(state.draft('a').reps).toBe('8');
      expect(state.draft('b')).toEqual(emptyDraft);
      state.editDraft('a', 'weight', '80');
      expect(state.errors('a')).toEqual({});
      dispose();
    }));

  it('keeps interval and assistance for the next set', () =>
    createRoot((dispose) => {
      const state = createSessionEditorState();
      state.editDraft('a', 'reps', '8');
      state.editDraft('a', 'interval', '90');
      state.setAssisted('a', true);
      state.resetDraft('a');
      expect(state.draft('a')).toEqual({ ...emptyDraft, interval: '90', assisted: true });
      dispose();
    }));
});
