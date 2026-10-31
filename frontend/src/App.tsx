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

const queryClient = createAppQueryClient();

// The only place browser-backed infrastructure is created.
const infra: Infra = { clock: createSystemClock() };

const Layout: Component<{ children?: JSX.Element }> = (props) => {
  const navigate = useNavigate();
  return (
    <div class="min-h-screen bg-white">
      <header class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <A class="text-lg font-semibold text-green-700" href="/">
          triary
        </A>
        <AccountMenuContainer onSignedOut={() => navigate('/login', { replace: true })} />
      </header>
      <main class="mx-auto max-w-3xl px-4">{props.children}</main>
    </div>
  );
};

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
          <Route path="/signup" component={Signup} />
          <Route path="/login" component={Login} />
          <Route path="*" component={NotFound} />
        </Router>
      </QueryClientProvider>
    </InfraProvider>
  );
};

export default App;
