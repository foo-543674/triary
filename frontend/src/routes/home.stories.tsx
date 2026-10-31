import { MemoryRouter, Route } from '@solidjs/router';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import Home from './index';

const meta: Meta<typeof Home> = {
  title: 'Routes/Home',
  component: Home,
  // Home links with <A>, which needs a router.
  render: () => (
    <MemoryRouter>
      <Route path="/" component={Home} />
    </MemoryRouter>
  ),
};

export default meta;

type Story = StoryObj<typeof Home>;

export const Default: Story = {};
