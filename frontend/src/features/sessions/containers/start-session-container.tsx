import type { JSX } from 'solid-js';
import type { Clock } from '../../../lib/infra/clock';
import { StartSession } from '../components/start-session';
import { createStartSessionMutation } from '../mutations/start-session';

type Props = { readonly clock: Clock; readonly onStarted: (sessionId: string) => void };

/** Starts a session dated with the device's local day (US-7). */
export const StartSessionContainer = (props: Props): JSX.Element => {
  const start = createStartSessionMutation({ onSuccess: (session) => props.onStarted(session.id) });
  return (
    <StartSession
      starting={start.isPending}
      failed={start.isError}
      onStart={() => start.mutate({ workout_date: props.clock.today() })}
    />
  );
};
