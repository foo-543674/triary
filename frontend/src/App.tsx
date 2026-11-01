import { A, Route, Router, useNavigate } from '@solidjs/router';
import { QueryClientProvider } from '@tanstack/solid-query';
import { type Component, type JSX, lazy } from 'solid-js';
import { createAppQueryClient } from './api/query-client';
import { AccountMenuContainer } from './features/auth/containers/account-menu-container';
import { RequireAuthContainer } from './features/auth/containers/require-auth-container';
import { createSystemClock } from './lib/infra/clock';
import { type Infra, InfraProvider } from './lib/infra/context';

const Home = lazy(() => import('./routes/index'));
const NotFound = lazy(() => import('./routes/not-found'));
const Signup = lazy(() => import('./routes/signup'));
const Login = lazy(() => import('./routes/login'));
const Exercises = lazy(() => import('./routes/exercises/index'));
const ExerciseDetail = lazy(() => import('./routes/exercises/detail'));
const SessionDetail = lazy(() => import('./routes/sessions/detail'));
const History = lazy(() => import('./routes/history/index'));

const queryClient = createAppQueryClient();

// The only place browser-backed infrastructure is created.
const infra: Infra = { clock: createSystemClock() };

const Layout: Component<{ children?: JSX.Element }> = (props) => {
  const navigate = useNavigate();
  return (
    <div class="min-h-screen bg-white">
      <header class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <nav class="flex items-center gap-4">
          <A class="text-lg font-semibold text-green-700" href="/">
            triary
          </A>
          <A class="text-sm text-gray-700 hover:text-green-700" href="/exercises">
            種目
          </A>
          <A class="text-sm text-gray-700 hover:text-green-700" href="/history">
            履歴
          </A>
        </nav>
        <AccountMenuContainer onSignedOut={() => navigate('/login', { replace: true })} />
      </header>
      <main class="mx-auto max-w-3xl px-4">{props.children}</main>
    </div>
  );
};

/** A page only signed-in users may open. */
const Protected: Component<{ page: Component }> = (props) => (
  <RequireAuthContainer loginPath="/login">{props.page({})}</RequireAuthContainer>
);

const App: Component = () => {
  return (
    <InfraProvider value={infra}>
      <QueryClientProvider client={queryClient}>
        <Router root={Layout}>
          <Route
            path="/"
            component={() => (
              <RequireAuthContainer loginPath="/login">
                <Home />
              </RequireAuthContainer>
            )}
          />
          <Route path="/exercises" component={() => <Protected page={Exercises} />} />
          <Route path="/exercises/:id" component={() => <Protected page={ExerciseDetail} />} />
          <Route path="/sessions/:id" component={() => <Protected page={SessionDetail} />} />
          <Route path="/history" component={() => <Protected page={History} />} />
          <Route path="/signup" component={Signup} />
          <Route path="/login" component={Login} />
          <Route path="*" component={NotFound} />
        </Router>
      </QueryClientProvider>
    </InfraProvider>
  );
};

export default App;
