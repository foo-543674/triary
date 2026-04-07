import { A } from '@solidjs/router';
import type { Component } from 'solid-js';

const NotFound: Component = () => {
  return (
    <section class="py-20 text-center">
      <h1 class="text-4xl font-bold">404</h1>
      <p class="mt-4 text-gray-600">Page not found.</p>
      <A class="mt-6 inline-block text-green-700 underline" href="/">
        Back to home
      </A>
    </section>
  );
};

export default NotFound;
