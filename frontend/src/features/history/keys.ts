/** TanStack Query keys of the history feature (under "sessions" so session edits refresh it). */
export const historyKeys = {
  byDate: () => ['sessions', 'history', 'by-date'] as const,
};
