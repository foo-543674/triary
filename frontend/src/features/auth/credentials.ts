/**
 * The sign-up rules of specification US-1, checked in the browser so that
 * invalid input never reaches the server. The server checks the same rules
 * (backend `UserHandle` / `Password`) and remains the authority: these only
 * save a round trip. Codes and fields match the API's error envelope.
 */

export type FieldErrors = Readonly<Record<'user_id' | 'password', readonly string[]>>;

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 32;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
/** Same provisional list as the backend (needs-decision #69). */
export const RESERVED_HANDLES: readonly string[] = ['admin', 'api', 'system', 'triary', 'root'];

const HANDLE_CHARS = /^[a-z0-9_-]*$/;

/** Length in characters as the server counts them (Unicode scalar values). */
const charCount = (value: string): number => Array.from(value).length;

const rules = (checks: ReadonlyArray<readonly [boolean, string]>): readonly string[] =>
  checks.filter(([broken]) => broken).map(([, code]) => code);

export const handleErrors = (raw: string): readonly string[] => {
  const handle = raw.toLowerCase();
  const length = charCount(handle);
  const broken = rules([
    [length < HANDLE_MIN, 'too_short'],
    [length > HANDLE_MAX, 'too_long'],
    [!HANDLE_CHARS.test(handle), 'invalid_charset'],
  ]);
  return broken.length === 0 && RESERVED_HANDLES.includes(handle) ? ['reserved'] : broken;
};

export const passwordErrors = (raw: string): readonly string[] => {
  const length = charCount(raw);
  return rules([
    [length < PASSWORD_MIN, 'too_short'],
    [length > PASSWORD_MAX, 'too_long'],
  ]);
};

export const credentialErrors = (userId: string, password: string): FieldErrors => ({
  user_id: handleErrors(userId),
  password: passwordErrors(password),
});

export const hasErrors = (errors: FieldErrors): boolean =>
  errors.user_id.length > 0 || errors.password.length > 0;
