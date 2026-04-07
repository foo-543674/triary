import type { Component } from 'solid-js';

/**
 * `/` ルートに対応するトップ画面の placeholder。
 * 実際のダッシュボード (直近のトレーニング・次回の予定など) に差し替えていく。
 */
const Home: Component = () => {
  return (
    <section class="py-20 text-center">
      <h1 class="text-4xl font-bold text-green-700">triary</h1>
      <p class="mt-4 text-gray-600">Let's log your workout.</p>
    </section>
  );
};

export default Home;
