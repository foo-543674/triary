import { MemoryRouter, Route } from '@solidjs/router';
import { render, renderHook, screen, waitFor } from '@solidjs/testing-library';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { HttpResponse, http } from 'msw';
import type { JSX } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { RequireAuthContainer } from './containers/require-auth-container';
import { authKeys } from './keys';
import { createLoginMutation } from './mutations/login';
import { createLogoutMutation } from './mutations/logout';
import { createCurrentUserQuery } from './queries/current-user';

/**
 * Auth queries and mutations against MSW-mocked HTTP, checking what ends up
 * in the TanStack Query cache (the behavior other screens rely on).
 */

const envelope = (code: string) => ({ errors: [{ code, message: code }] });

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const wrapperFor = (client: QueryClient) => (props: { children: JSX.Element }) => (
  <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
);

describe('createCurrentUserQuery', () => {
  it('yields the user for a valid session', async () => {
    server.use(http.get('*/web/v1/me', () => HttpResponse.json({ user_id: 'alice' })));
    const { result } = renderHook(createCurrentUserQuery, { wrapper: wrapperFor(newClient()) });
    await waitFor(() => expect(result.isSuccess).toBe(true));
    expect(result.data).toEqual({ user_id: 'alice' });
  });

  it('treats 401 unauthenticated as signed out, not as an error', async () => {
    server.use(
      http.get('*/web/v1/me', () =>
        HttpResponse.json(envelope('unauthenticated'), { status: 401 }),
      ),
    );
    const { result } = renderHook(createCurrentUserQuery, { wrapper: wrapperFor(newClient()) });
    await waitFor(() => expect(result.isSuccess).toBe(true));
    expect(result.data).toBeNull();
  });

  it('reports other failures as errors', async () => {
    server.use(
      http.get('*/web/v1/me', () => HttpResponse.json(envelope('internal_error'), { status: 500 })),
    );
    const { result } = renderHook(createCurrentUserQuery, { wrapper: wrapperFor(newClient()) });
    await waitFor(() => expect(result.isError).toBe(true));
    expect(result.error?.status).toBe(500);
  });
});

describe('createLoginMutation', () => {
  it('puts the signed-in user into the current-user cache', async () => {
    server.use(http.post('*/web/v1/login', () => HttpResponse.json({ user_id: 'alice' })));
    const client = newClient();
    const signedIn: string[] = [];
    const { result } = renderHook(
      () => createLoginMutation({ onSuccess: (user) => signedIn.push(user.user_id) }),
      {
        wrapper: wrapperFor(client),
      },
    );
    result.mutate({ user_id: 'alice', password: 'correcthorsebattery' });
    await waitFor(() => expect(result.isSuccess).toBe(true));
    expect(client.getQueryData(authKeys.me)).toEqual({ user_id: 'alice' });
    expect(signedIn).toEqual(['alice']);
  });

  it('surfaces invalid_credentials as an ApiError', async () => {
    server.use(
      http.post('*/web/v1/login', () =>
        HttpResponse.json(envelope('invalid_credentials'), { status: 401 }),
      ),
    );
    const client = newClient();
    const { result } = renderHook(() => createLoginMutation({ onSuccess: () => {} }), {
      wrapper: wrapperFor(client),
    });
    result.mutate({ user_id: 'alice', password: 'wrong' });
    await waitFor(() => expect(result.isError).toBe(true));
    expect(result.error?.errors[0].code).toBe('invalid_credentials');
    expect(client.getQueryData(authKeys.me)).toBeUndefined();
  });
});

describe('createLogoutMutation', () => {
  const signedInClient = () => {
    const client = newClient();
    client.setQueryData(authKeys.me, { user_id: 'alice' });
    client.setQueryData(['exercises', 'list'], ['cached']);
    return client;
  };

  it('forgets the user and every cached query', async () => {
    server.use(http.post('*/web/v1/logout', () => new HttpResponse(null, { status: 204 })));
    const client = signedInClient();
    const { result } = renderHook(() => createLogoutMutation({ onSuccess: () => {} }), {
      wrapper: wrapperFor(client),
    });
    result.mutate();
    await waitFor(() => expect(result.isSuccess).toBe(true));
    expect(client.getQueryData(authKeys.me)).toBeNull();
    expect(client.getQueryData(['exercises', 'list'])).toBeUndefined();
  });

  it('counts an already ended session (401) as logged out', async () => {
    server.use(
      http.post('*/web/v1/logout', () =>
        HttpResponse.json(envelope('unauthenticated'), { status: 401 }),
      ),
    );
    const client = signedInClient();
    const { result } = renderHook(() => createLogoutMutation({ onSuccess: () => {} }), {
      wrapper: wrapperFor(client),
    });
    result.mutate();
    await waitFor(() => expect(result.isSuccess).toBe(true));
    expect(client.getQueryData(authKeys.me)).toBeNull();
  });

  it('keeps the user when the server could not log out', async () => {
    server.use(
      http.post('*/web/v1/logout', () =>
        HttpResponse.json(envelope('internal_error'), { status: 500 }),
      ),
    );
    const client = signedInClient();
    const { result } = renderHook(() => createLogoutMutation({ onSuccess: () => {} }), {
      wrapper: wrapperFor(client),
    });
    result.mutate();
    await waitFor(() => expect(result.isError).toBe(true));
    expect(client.getQueryData(authKeys.me)).toEqual({ user_id: 'alice' });
  });
});

describe('RequireAuthContainer', () => {
  const renderGuarded = () =>
    render(() => (
      <QueryClientProvider client={newClient()}>
        <MemoryRouter>
          <Route
            path="/"
            component={() => (
              <RequireAuthContainer loginPath="/login">
                <p>main screen</p>
              </RequireAuthContainer>
            )}
          />
          <Route path="/login" component={() => <p>login page</p>} />
        </MemoryRouter>
      </QueryClientProvider>
    ));

  it('shows the screen to a signed-in user', async () => {
    server.use(http.get('*/web/v1/me', () => HttpResponse.json({ user_id: 'alice' })));
    renderGuarded();
    expect(await screen.findByText('main screen')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to login', async () => {
    server.use(
      http.get('*/web/v1/me', () =>
        HttpResponse.json(envelope('unauthenticated'), { status: 401 }),
      ),
    );
    renderGuarded();
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('sends the visitor to login when the check itself fails', async () => {
    server.use(http.get('*/web/v1/me', () => HttpResponse.error()));
    renderGuarded();
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });
});
