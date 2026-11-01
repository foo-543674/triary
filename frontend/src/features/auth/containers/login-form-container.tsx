import type { JSX } from 'solid-js';
import { LoginForm } from '../components/login-form';
import { loginErrors } from '../credentials';
import { createLoginMutation } from '../mutations/login';
import { createCredentialsFormState } from '../state/credentials-form';

type Props = { readonly signupPath: string; readonly onSignedIn: () => void };

/** Wires the login form to its state and the login request. */
export const LoginFormContainer = (props: Props): JSX.Element => {
  const form = createCredentialsFormState(loginErrors);
  const login = createLoginMutation({ onSuccess: () => props.onSignedIn() });
  return (
    <LoginForm
      userId={form.userId()}
      password={form.password()}
      errors={form.fieldErrors()}
      generalErrors={form.generalErrors()}
      submitting={login.isPending}
      signupPath={props.signupPath}
      onUserIdInput={form.setUserId}
      onPasswordInput={form.setPassword}
      onSubmit={() => {
        if (form.attemptSubmit()) {
          login.mutate(
            { user_id: form.userId(), password: form.password() },
            { onError: form.showServerError },
          );
        }
      }}
    />
  );
};
