import { render } from '@solidjs/testing-library';
import type { Component } from 'solid-js';
import { describe, it } from 'vitest';

/**
 * src 配下の全ての *.stories.tsx を vitest でロードし、
 * 各ストーリーを実際にレンダリングしてランタイム例外が出ないことを検証するスモークテスト。
 *
 * Storybook 8 で `--smoke-test` フラグが廃止されたため、
 * 代替として "ストーリーが実描画できる" ことをここで担保する。
 * ビルド時の設定崩れなどは別途 CI の `build-storybook` ジョブで検知する。
 */

type StoryModule = {
  default: {
    component?: Component<Record<string, unknown>>;
  };
  [name: string]: unknown;
};

const storyModules = import.meta.glob<StoryModule>('../**/*.stories.tsx', {
  eager: true,
});

describe('stories smoke', () => {
  const entries = Object.entries(storyModules);

  if (entries.length === 0) {
    it.skip('no stories discovered', () => {});
    return;
  }

  for (const [path, mod] of entries) {
    const meta = mod.default;
    const Component = meta?.component;

    if (!Component) {
      it.skip(`${path} (no component on default export)`, () => {});
      continue;
    }

    for (const [exportName, value] of Object.entries(mod)) {
      if (exportName === 'default') continue;
      if (value === null || typeof value !== 'object') continue;

      const story = value as { args?: Record<string, unknown> };
      it(`${path} :: ${exportName}`, () => {
        render(() => <Component {...(story.args ?? {})} />);
      });
    }
  }
});
