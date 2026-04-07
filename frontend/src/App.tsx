import { A, Route, Router } from '@solidjs/router';
import { QueryClientProvider } from '@tanstack/solid-query';
import { type Component, type JSX, lazy } from 'solid-js';
import { createAppQueryClient } from './api/query-client';

const Home = lazy(() => import('./routes/index'));
const NotFound = lazy(() => import('./routes/not-found'));

const queryClient = createAppQueryClient();

const Layout: Component<{ children?: JSX.Element }> = (props) => {
  return (
    <div class="min-h-screen bg-white">
      <header class="border-b border-gray-200 px-4 py-3">
        <A class="text-lg font-semibold text-green-700" href="/">
          triary
        </A>
      </header>
      <main class="mx-auto max-w-3xl px-4">{props.children}</main>
    </div>
  );
};

const App: Component = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <Router root={Layout}>
        <Route path="/" component={Home} />
        <Route path="*" component={NotFound} />
      </Router>
    </QueryClientProvider>
  );
};

export default App;
