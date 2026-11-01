import { MemoryRouter, Route } from '@solidjs/router';
import { render, screen } from '@solidjs/testing-library';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { describe, expect, it } from 'vitest';
import { createFixedClock } from '../lib/infra/clock';
import { InfraProvider } from '../lib/infra/context';
import Home from './index';

describe('Home route', () => {
  it('offers to start a workout', async () => {
    render(() => (
      <InfraProvider value={{ clock: createFixedClock(new Date(2026, 9, 31)) }}>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <Route path="/" component={Home} />
          </MemoryRouter>
        </QueryClientProvider>
      </InfraProvider>
    ));
    expect(await screen.findByRole('heading', { name: /triary/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'トレーニング開始' })).toBeInTheDocument();
  });
});
