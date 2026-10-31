import { A } from '@solidjs/router';
import { For, type JSX, Show } from 'solid-js';
import { Button } from '../../../components/button';
import { TextField } from '../../../components/text-field';
import type { FieldErrors } from '../credentials';
import { fieldMessage, generalMessage } from '../messages';

type Props = {
  readonly userId: string;
  readonly password: string;
  readonly errors: FieldErrors;
  readonly generalErrors: readonly string[];
  readonly submitting: boolean;
  readonly signupPath: string;
  readonly onUserIdInput: (value: string) => void;
  readonly onPasswordInput: (value: string) => void;
  readonly onSubmit: () => void;
};

/** Login form (US-2). Fully controlled; error codes come in as props. */
export const LoginForm = (props: Props): JSX.Element => (
  <form
    class="mx-auto flex max-w-sm flex-col gap-4 py-10"
    noValidate
    onSubmit={(event) => {
      event.preventDefault();
      props.onSubmit();
    }}
  >
    <h1 class="text-2xl font-bold text-gray-900">ログイン</h1>
    <Show when={props.generalErrors.length > 0}>
      <div
        role="alert"
        class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        <For each={props.generalErrors}>{(code) => <p>{generalMessage(code)}</p>}</For>
      </div>
    </Show>
    <TextField
      id="login-user-id"
      label="ユーザー ID"
      value={props.userId}
      autocomplete="username"
      errors={props.errors.user_id.map((code) => fieldMessage('user_id', code))}
      onInput={(value) => props.onUserIdInput(value)}
    />
    <TextField
      id="login-password"
      label="パスワード"
      type="password"
      value={props.password}
      autocomplete="current-password"
      errors={props.errors.password.map((code) => fieldMessage('password', code))}
      onInput={(value) => props.onPasswordInput(value)}
    />
    <Button
      type="submit"
      label={props.submitting ? 'ログイン中…' : 'ログイン'}
      disabled={props.submitting}
    />
    <p class="text-center text-sm text-gray-600">
      アカウントがない場合は{' '}
      <A class="text-green-700 underline" href={props.signupPath}>
        アカウントを作成
      </A>
    </p>
  </form>
);
