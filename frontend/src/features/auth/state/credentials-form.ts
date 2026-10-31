import { type Accessor, createMemo, createSignal } from 'solid-js';
import { type ApiError, codesForField, generalErrors } from '../../../lib/api-error';
import { credentialErrors, type FieldErrors, hasErrors } from '../credentials';

export type CredentialsFormState = {
  readonly userId: Accessor<string>;
  readonly password: Accessor<string>;
  readonly setUserId: (value: string) => void;
  readonly setPassword: (value: string) => void;
  /** Errors to show per field: the browser's checks once the user tried to submit, plus the server's answer. */
  readonly fieldErrors: Accessor<FieldErrors>;
  /** Server errors not tied to a field (network, rate limit, ...), as codes. */
  readonly generalErrors: Accessor<readonly string[]>;
  /** Marks a submit attempt; true when the input passes the browser's checks. */
  readonly attemptSubmit: () => boolean;
  readonly showServerError: (error: ApiError) => void;
};

/**
 * Screen state of a user ID + password form. Errors appear only after the
 * first submit attempt, and a server error goes away as soon as the user
 * edits the form.
 */
export const createCredentialsFormState = (): CredentialsFormState => {
  const [userId, setUserIdSignal] = createSignal('');
  const [password, setPasswordSignal] = createSignal('');
  const [attempted, setAttempted] = createSignal(false);
  const [serverError, setServerError] = createSignal<ApiError | undefined>();

  const clientErrors = createMemo(() => credentialErrors(userId(), password()));

  const fieldErrors = createMemo((): FieldErrors => {
    const local = attempted() ? clientErrors() : { user_id: [], password: [] };
    const remote = serverError();
    const fromServer = (field: 'user_id' | 'password') =>
      remote === undefined ? [] : codesForField(remote, field);
    return {
      user_id: [...new Set([...local.user_id, ...fromServer('user_id')])],
      password: [...new Set([...local.password, ...fromServer('password')])],
    };
  });

  const edited = (set: (value: string) => void) => (value: string) => {
    set(value);
    setServerError(undefined);
  };

  return {
    userId,
    password,
    setUserId: edited(setUserIdSignal),
    setPassword: edited(setPasswordSignal),
    fieldErrors,
    generalErrors: () => {
      const remote = serverError();
      return remote === undefined ? [] : generalErrors(remote).map((item) => item.code);
    },
    attemptSubmit: () => {
      setAttempted(true);
      return !hasErrors(clientErrors());
    },
    showServerError: setServerError,
  };
};
