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
    </section>
  );
};

export default Home;
