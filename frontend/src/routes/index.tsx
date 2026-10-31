import { A } from '@solidjs/router';
import type { Component } from 'solid-js';

/**
 * Placeholder for the top page mounted at `/`.
 *
 * To be replaced with the real dashboard (recent workouts, next planned
 * session, etc.) as those features land.
 */
const Home: Component = () => {
  return (
    <section class="py-20 text-center">
      <h1 class="text-4xl font-bold text-green-700">triary</h1>
      <p class="mt-4 text-gray-600">Let's log your workout.</p>
      <A
        class="mt-8 inline-block rounded bg-green-700 px-4 py-2 font-semibold text-white"
        href="/signup"
      >
        アカウントを作成
      </A>
    </section>
  );
};

export default Home;
