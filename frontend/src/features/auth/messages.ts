/**
 * Japanese wording for API error codes on the auth forms. The server's
 * `message` is for debugging only (api-design §1.6); the UI picks text by
 * `(code, field)`.
 */

const handleMessages: Readonly<Record<string, string>> = {
  required: 'ユーザー ID を入力してください',
  too_short: 'ユーザー ID は 3 文字以上にしてください',
  too_long: 'ユーザー ID は 32 文字以内にしてください',
  invalid_charset: 'ユーザー ID に使えるのは半角英数字と _ - だけです',
  // US-1: a taken or reserved ID gets the same wording, so the reply does
  // not reveal that someone uses it.
  reserved: 'このユーザー ID は使えません',
  already_taken: 'このユーザー ID は使えません',
};

const passwordMessages: Readonly<Record<string, string>> = {
  required: 'パスワードを入力してください',
  too_short: 'パスワードは 12 文字以上にしてください',
  too_long: 'パスワードは 128 文字以内にしてください',
};

export const fieldMessage = (field: 'user_id' | 'password', code: string): string =>
  (field === 'user_id' ? handleMessages : passwordMessages)[code] ?? '入力内容を確認してください';

export const generalMessage = (code: string): string =>
  ({
    invalid_credentials: 'ユーザー ID またはパスワードが違います',
    rate_limited: '試行回数が多すぎます。しばらく待ってからもう一度お試しください',
    network_error: 'サーバーに接続できません。通信状態を確認してください',
  })[code] ?? 'エラーが発生しました。もう一度お試しください';
