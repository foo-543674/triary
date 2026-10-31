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
  readonly onUserIdInput: (value: string) => void;
  readonly onPasswordInput: (value: string) => void;
  readonly onSubmit: () => void;
};

/** Sign-up form (US-1). Fully controlled; error codes come in as props. */
export const SignupForm = (props: Props): JSX.Element => (
  <form
    class="mx-auto flex max-w-sm flex-col gap-4 py-10"
    noValidate
    onSubmit={(event) => {
      event.preventDefault();
      props.onSubmit();
    }}
  >
    <h1 class="text-2xl font-bold text-gray-900">アカウントを作成</h1>
    <Show when={props.generalErrors.length > 0}>
      <div
        role="alert"
        class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        <For each={props.generalErrors}>{(code) => <p>{generalMessage(code)}</p>}</For>
      </div>
    </Show>
    <TextField
      id="signup-user-id"
      label="ユーザー ID"
      value={props.userId}
      autocomplete="username"
      hint="3〜32 文字。半角英数字と _ - が使えます (大文字は小文字として扱います)"
      errors={props.errors.user_id.map((code) => fieldMessage('user_id', code))}
      onInput={(value) => props.onUserIdInput(value)}
    />
    <TextField
      id="signup-password"
      label="パスワード"
      type="password"
      value={props.password}
      autocomplete="new-password"
      hint="12〜128 文字"
      errors={props.errors.password.map((code) => fieldMessage('password', code))}
      onInput={(value) => props.onPasswordInput(value)}
    />
    <Button
      type="submit"
      label={props.submitting ? '登録中…' : '登録する'}
      disabled={props.submitting}
    />
  </form>
);
