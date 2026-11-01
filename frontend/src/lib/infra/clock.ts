import { toLocalDate } from '../date';

/**
 * Current time, as an infrastructure abstraction so tests and stories can
 * pin it (`.contexts/architecture.md` "フロントのインフラ抽象").
 */
export type Clock = {
  readonly now: () => Date;
  /** Today's local calendar date, `YYYY-MM-DD`. */
  readonly today: () => string;
};

export const createSystemClock = (): Clock => ({
  now: () => new Date(),
  today: () => toLocalDate(new Date()),
});

/** A clock stopped at `instant`, for tests and stories. */
export const createFixedClock = (instant: Date): Clock => ({
  now: () => new Date(instant.getTime()),
  today: () => toLocalDate(instant),
});
