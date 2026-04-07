import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import App from './App';

/**
 * App のスモークテスト。`Router` / `QueryClientProvider` を組み立てた最上位
 * コンポーネントが例外無くマウントできることだけを確認する。
 *
 * 個別ルートの内容は `routes/*.test.tsx` で検証する方針。
 * (App 全体を render すると将来 `Home` がデータ取得を始めた瞬間に
 * App.test.tsx 側で MSW ハンドラ追加が必要になり、責務が漏れるため)
 */
describe('App', () => {
  it('mounts without throwing', () => {
    expect(() => render(() => <App />)).not.toThrow();
  });
});
