import type { StorybookConfig } from 'storybook-solidjs-vite';

const config: StorybookConfig = {
  framework: {
    name: 'storybook-solidjs-vite',
    options: {},
  },
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  addons: [],
  // vite.config.ts を共有しているが、Storybook の build には PWA プラグインは不要。
  // むしろ VitePWA が Storybook の rollup 設定に `manualChunks` を流し込み、
  // 「Unknown input options: manualChunks」エラーで build が落ちる。
  // Storybook 向けには PWA プラグインを除去した config に差し替える。
  viteFinal: async (config) => {
    // vite の plugins はネスト配列を許すので再帰的に flatten してから filter する。
    const flatten = (input: unknown[]): unknown[] =>
      input.flatMap((p) => (Array.isArray(p) ? flatten(p) : [p]));

    const plugins = flatten(config.plugins ?? []).filter((plugin) => {
      if (!plugin || typeof plugin !== 'object') return true;
      const name = (plugin as { name?: string }).name ?? '';
      // vite-plugin-pwa は `vite-plugin-pwa` の他に `vite-plugin-pwa:build`
      // `vite-plugin-pwa:dev-sw` 等複数の Plugin を束ねて返す。全て除外する。
      return !name.startsWith('vite-plugin-pwa');
    });

    // biome-ignore lint/suspicious/noExplicitAny: vite の plugin 配列型に戻す
    return { ...config, plugins: plugins as any };
  },
};

export default config;
