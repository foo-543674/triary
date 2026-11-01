import { type JSX, Show } from 'solid-js';
import { AccountMenu } from '../components/account-menu';
import { createLogoutMutation } from '../mutations/logout';
import { createCurrentUserQuery } from '../queries/current-user';

type Props = { readonly onSignedOut: () => void };

/** The account menu of the signed-in user; nothing while signed out. */
export const AccountMenuContainer = (props: Props): JSX.Element => {
  const currentUser = createCurrentUserQuery();
  const logout = createLogoutMutation({ onSuccess: () => props.onSignedOut() });
  return (
    <Show when={currentUser.data}>
      {(user) => (
        <AccountMenu
          userId={user().user_id}
          signingOut={logout.isPending}
          signOutFailed={logout.isError}
          onSignOut={() => logout.mutate()}
        />
      )}
    </Show>
  );
};
