import { createContext, type JSX, useContext } from 'solid-js';
import type { Clock } from './clock';

/**
 * Browser-backed abstractions, created once in `App.tsx` and handed down.
 * Pages read them with {@link useInfraContext} and pass what a container
 * needs as props; containers and presentational components never call it.
 */
export type Infra = {
  readonly clock: Clock;
};

const InfraContext = createContext<Infra>();

export const InfraProvider = (props: { value: Infra; children: JSX.Element }): JSX.Element => (
  <InfraContext.Provider value={props.value}>{props.children}</InfraContext.Provider>
);

export const useInfraContext = (): Infra => {
  const infra = useContext(InfraContext);
  if (infra === undefined) {
    // A page rendered outside InfraProvider is a wiring bug, not user input.
    throw new Error('useInfraContext must be used inside InfraProvider');
  }
  return infra;
};
