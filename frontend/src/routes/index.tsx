import { useNavigate } from '@solidjs/router';
import type { Component } from 'solid-js';
import { StartSessionContainer } from '../features/sessions/containers/start-session-container';
import { useInfraContext } from '../lib/infra/context';

/** The main screen: start a workout (US-7). */
const Home: Component = () => {
  const { clock } = useInfraContext();
  const navigate = useNavigate();
  return (
    <section class="flex flex-col items-center gap-6 py-16 text-center">
      <h1 class="text-4xl font-bold text-green-700">triary</h1>
      <p class="text-gray-600">Let's log your workout.</p>
      <StartSessionContainer clock={clock} onStarted={(id) => navigate(`/sessions/${id}`)} />
    </section>
  );
};

export default Home;
