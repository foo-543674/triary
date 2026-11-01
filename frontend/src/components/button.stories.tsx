import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  args: { label: '登録する' },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
