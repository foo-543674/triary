import solidPlugin from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

// The test gate's configuration, kept apart from vite.config.ts on purpose
// (#105): this file is a CODEOWNERS base file and vite.config.ts is not, so
// it must not import or merge vite.config.ts; otherwise a change there
// (a `test:` block, a plugin) would change what the required test job checks
// without the owner's approval. Only the Solid plugin is needed to compile
// the components under test; the PWA, Tailwind and devtools plugins of
// vite.config.ts are not used by any test (checked 2026-11-02:
// `git grep` finds no `virtual:` import in src/ or .storybook/).
export default defineConfig({
  plugins: [solidPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
