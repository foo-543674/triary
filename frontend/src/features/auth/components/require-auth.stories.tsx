import { MemoryRouter, Route } from '@solidjs/router';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { RequireAuth } from './require-auth';

/**
 * Each status of the guard. `signed-out` navigates, so every story runs
 * inside a memory router whose `/login` route shows where the guard sent
 * the visitor.
 */
const meta: Meta<typeof RequireAuth> = {
  title: 'Features/Auth/RequireAuth',
  component: RequireAuth,
  args: { loginPath: '/login' },
  render: (args) => (
    <MemoryRouter>
      <Route
        path="/"
        component={() => (
          <RequireAuth status={args.status} loginPath={args.loginPath}>
            <p>Protected content</p>
          </RequireAuth>
        )}
      />
      <Route path="/login" component={() => <p>Redirected to the login page</p>} />
    </MemoryRouter>
  ),
};

export default meta;

type Story = StoryObj<typeof RequireAuth>;

export const Checking: Story = { args: { status: 'checking' } };
export const SignedIn: Story = { args: { status: 'signed-in' } };
export const SignedOut: Story = { args: { status: 'signed-out' } };
