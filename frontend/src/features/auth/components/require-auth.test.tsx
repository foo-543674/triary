import { MemoryRouter, Route } from '@solidjs/router';
import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { type AuthStatus, RequireAuth } from './require-auth';

// MemoryRouter: the browser router would carry jsdom's URL (e.g. /login
// after a redirect) into the next test.
const renderAt = (status: AuthStatus) =>
  render(() => (
    <MemoryRouter>
      <Route
        path="/"
        component={() => (
          <RequireAuth status={status} loginPath="/login">
            <p>secret</p>
          </RequireAuth>
        )}
      />
      <Route path="/login" component={() => <p>login page</p>} />
    </MemoryRouter>
  ));

describe('RequireAuth', () => {
  it('shows the protected content when signed in', async () => {
    renderAt('signed-in');
    expect(await screen.findByText('secret')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to the login page', async () => {
    renderAt('signed-out');
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('shows neither while the session is being checked', async () => {
    renderAt('checking');
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
});
