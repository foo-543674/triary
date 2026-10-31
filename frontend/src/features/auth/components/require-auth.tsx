import { Navigate } from '@solidjs/router';
import { type JSX, Match, Switch } from 'solid-js';

/** Where the browser session stands, as far as the app knows. */
export type AuthStatus = 'checking' | 'signed-in' | 'signed-out';

type Props = {
  readonly status: AuthStatus;
  /** Where to send a signed-out visitor. */
  readonly loginPath: string;
  readonly children: JSX.Element;
};

/**
 * Shows `children` only to a signed-in user. Fully controlled: the caller
 * decides the status (from the current-user query), this only renders.
 */
export const RequireAuth = (props: Props): JSX.Element => (
  <Switch>
    <Match when={props.status === 'signed-in'}>{props.children}</Match>
    <Match when={props.status === 'signed-out'}>
      <Navigate href={props.loginPath} />
    </Match>
    <Match when={props.status === 'checking'}>
      <p class="py-20 text-center text-gray-500" role="status">
        Loading…
      </p>
    </Match>
  </Switch>
);
