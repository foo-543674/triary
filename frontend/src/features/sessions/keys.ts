/** TanStack Query keys of the sessions feature. */
export const sessionKeys = {
  all: ['sessions'] as const,
  detail: (id: string) => ['sessions', 'detail', id] as const,
};
