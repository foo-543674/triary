import type { StorybookConfig } from 'storybook-solidjs-vite';

const config: StorybookConfig = {
  framework: {
    name: 'storybook-solidjs-vite',
    options: {},
  },
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  addons: [],
  // HACK: We share `vite.config.ts` with the app, but Storybook builds do
  //       not need (and actively break with) the PWA plugin: VitePWA injects
  //       a `manualChunks` option into Storybook's rollup pipeline, causing
  //       the build to fail with "Unknown input options: manualChunks". As
  //       a workaround we strip the PWA plugin out of the config that
  //       Storybook sees.
  viteFinal: async (config) => {
    // NOTE: Vite allows nested plugin arrays, so flatten recursively before
    //       filtering.
    const flatten = (input: unknown[]): unknown[] =>
      input.flatMap((p) => (Array.isArray(p) ? flatten(p) : [p]));

    const plugins = flatten(config.plugins ?? []).filter((plugin) => {
      if (!plugin || typeof plugin !== 'object') return true;
      const name = (plugin as { name?: string }).name ?? '';
      // NOTE: vite-plugin-pwa exposes several Plugin objects (the main
      //       `vite-plugin-pwa` one plus `vite-plugin-pwa:build`,
      //       `vite-plugin-pwa:dev-sw`, ...). Drop them all.
      return !name.startsWith('vite-plugin-pwa');
    });

    // biome-ignore lint/suspicious/noExplicitAny: cast back to vite's plugin array type
    return { ...config, plugins: plugins as any };
  },
};

export default config;
