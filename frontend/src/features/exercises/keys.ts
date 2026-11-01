/** TanStack Query keys of the exercises feature. */
export const exerciseKeys = {
  all: ['exercises'] as const,
  list: () => ['exercises', 'list'] as const,
  detail: (id: string) => ['exercises', 'detail', id] as const,
};
