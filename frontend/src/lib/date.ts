/**
 * Calendar helpers. The server keeps no time zone (`api-design.md` §1.1), so
 * "which day" is always decided here, in the browser's local time.
 */

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/** Local calendar date of an instant as `YYYY-MM-DD` (the API's `WorkoutDate`). */
export const toLocalDate = (instant: Date): string =>
  `${pad(instant.getFullYear(), 4)}-${pad(instant.getMonth() + 1, 2)}-${pad(instant.getDate(), 2)}`;
