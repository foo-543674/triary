import { MemoryRouter, Route } from '@solidjs/router';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createFixedClock } from '../lib/infra/clock';
import { InfraProvider } from '../lib/infra/context';
import Home from './index';

const meta: Meta<typeof Home> = {
  title: 'Routes/Home',
  component: Home,
  // Home reads the clock from InfraProvider and starts sessions through
  // TanStack Query; the story supplies both (no request is sent unless the
  // button is pressed).
  render: () => (
    <InfraProvider value={{ clock: createFixedClock(new Date(2026, 9, 31)) }}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Route path="/" component={Home} />
        </MemoryRouter>
      </QueryClientProvider>
    </InfraProvider>
  ),
};

export default meta;
type Story = StoryObj<typeof Home>;

export const Default: Story = {};
