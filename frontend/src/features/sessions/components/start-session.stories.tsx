import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { StartSession } from './start-session';

const meta: Meta<typeof StartSession> = {
  title: 'Features/Sessions/StartSession',
  component: StartSession,
  args: { starting: false, failed: false, onStart: () => {} },
};

export default meta;
type Story = StoryObj<typeof StartSession>;

export const Default: Story = {};
export const Starting: Story = { args: { starting: true } };
export const Failed: Story = { args: { failed: true } };
