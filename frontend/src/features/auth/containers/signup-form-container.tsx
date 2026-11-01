import type { JSX } from 'solid-js';
import { SignupForm } from '../components/signup-form';
import { createSignupMutation } from '../mutations/signup';
import { createCredentialsFormState } from '../state/credentials-form';

type Props = { readonly onSignedUp: () => void };

/** Wires the sign-up form to its state and the sign-up request. */
export const SignupFormContainer = (props: Props): JSX.Element => {
  const form = createCredentialsFormState();
  const signup = createSignupMutation({ onSuccess: () => props.onSignedUp() });
  return (
    <SignupForm
      userId={form.userId()}
      password={form.password()}
      errors={form.fieldErrors()}
      generalErrors={form.generalErrors()}
      submitting={signup.isPending}
      onUserIdInput={form.setUserId}
      onPasswordInput={form.setPassword}
      onSubmit={() => {
        if (form.attemptSubmit()) {
          signup.mutate(
            { user_id: form.userId(), password: form.password() },
            { onError: form.showServerError },
          );
        }
      }}
    />
  );
};
