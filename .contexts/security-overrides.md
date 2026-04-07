# pnpm overrides — セキュリティ patch 台帳

`frontend/package.json` の `pnpm.overrides` で固定している transitive dep の
**理由・対象 advisory・棚卸し方針**を記録する。pnpm の overrides は JSON のため
インラインコメントを書けないので、メタ情報はここに置く。

dependabot からの更新 PR が来たタイミングで、本ファイルの "棚卸し" 列を確認し、
直接依存が新しい minor/major にアップデートして transitive が patched バージョン以上に
なっていたら、対応する override を削除する (= 役目を終えた override を残さない)。

| パッケージ | 強制バージョン | 経路 | Advisory / 理由 | 解除条件 |
|---|---|---|---|---|
| `seroval` | `>=1.4.1` | `solid-js` 経由 | GHSA (prototype pollution 系) | `solid-js` が seroval `>=1.4.1` を直接参照 |
| `tar` | `>=7.5.11` | `node-gyp` 等の install 周辺 | 連続する tar 系 advisory (path traversal 等) を patched 版で打ち消す | upstream が tar `>=7.5.11` を pin |
| `rollup` | `>=4.59.0` | `vite` / storybook builder 経由 | rollup 系 advisory | `vite` / storybook が patched 版を要求 |
| `picomatch` | `>=4.0.4` | `vite` / `tinyglobby` / `fdir` 経由 | ReDoS via extglob quantifiers (GHSA-c2c7-rcm5-vvqj) | 上流チェーンが picomatch `>=4.0.4` を要求 |
| `yaml` | `>=2.8.3` | 設定ロード系 | yaml パーサの DoS 系 | 上流が patched 版を要求 |
| `serialize-javascript` | `>=7.0.5` | `workbox-build` → `@rollup/plugin-terser` 経由 | XSS 系 advisory | `workbox-build` が patched 版を pin |

## 棚卸しの運用

1. 週次の dependabot PR が `vite` / `solid-js` / `storybook` / `vite-plugin-pwa` の
   更新を流してきたら、その PR 内で `pnpm audit --audit-level high` が override 無しでも
   green になるかをローカルで確認する。
2. green になるなら本 override 行と対応する `package.json` のエントリを同じ PR で削除する。
3. 新しい高 severity advisory が出て pnpm audit が落ちるようになったら、
   対応 override をここに追加し、テーブルにも追記する。
