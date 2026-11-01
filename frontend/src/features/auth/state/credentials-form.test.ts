import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { toApiError } from '../../../lib/api-error';
import { createCredentialsFormState } from './credentials-form';

const withState = (run: (state: ReturnType<typeof createCredentialsFormState>) => void) =>
  createRoot((dispose) => {
    run(createCredentialsFormState());
    dispose();
  });

describe('createCredentialsFormState', () => {
  it('shows no errors before the first submit attempt', () => {
    withState((state) => {
      state.setUserId('a');
      expect(state.fieldErrors()).toEqual({ user_id: [], password: [] });
    });
  });

  it('blocks a submit with invalid input and then shows why', () => {
    withState((state) => {
      state.setUserId('a');
      state.setPassword('short');
      expect(state.attemptSubmit()).toBe(false);
      expect(state.fieldErrors()).toEqual({ user_id: ['too_short'], password: ['too_short'] });
    });
  });

  it('lets valid input through', () => {
    withState((state) => {
      state.setUserId('alice');
      state.setPassword('correcthorsebattery');
      expect(state.attemptSubmit()).toBe(true);
    });
  });

  it('shows server errors until the user edits the form', () => {
    withState((state) => {
      state.setUserId('alice');
      state.setPassword('correcthorsebattery');
      state.attemptSubmit();
      state.showServerError(
        toApiError(400, {
          errors: [{ field: 'user_id', reasons: [{ code: 'already_taken', message: '' }] }],
        }),
      );
      expect(state.fieldErrors().user_id).toEqual(['already_taken']);
      state.setUserId('alice2');
      expect(state.fieldErrors().user_id).toEqual([]);
    });
  });

  it('keeps errors without a field apart', () => {
    withState((state) => {
      state.showServerError({ status: 0, errors: [{ code: 'network_error', message: '' }] });
      expect(state.generalErrors()).toEqual(['network_error']);
      expect(state.fieldErrors()).toEqual({ user_id: [], password: [] });
    });
  });
});
