import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import Home from './index';

const meta: Meta<typeof Home> = {
  title: 'Routes/Home',
  component: Home,
};

export default meta;

type Story = StoryObj<typeof Home>;

export const Default: Story = {};
