import type { JSX } from 'solid-js';
import { type AuthStatus, RequireAuth } from '../components/require-auth';
import { createCurrentUserQuery } from '../queries/current-user';

type Props = { readonly loginPath: string; readonly children: JSX.Element };

/** Guards `children` with the current-user query. */
export const RequireAuthContainer = (props: Props): JSX.Element => {
  const currentUser = createCurrentUserQuery();
  const status = (): AuthStatus => {
    if (currentUser.isPending) {
      return 'checking';
    }
    // A failed check (network, 5xx) cannot prove a session; ask to sign in.
    return currentUser.data ? 'signed-in' : 'signed-out';
  };
  return (
    <RequireAuth status={status()} loginPath={props.loginPath}>
      {props.children}
    </RequireAuth>
  );
};
