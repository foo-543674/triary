import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { SignupForm } from './signup-form';

const meta: Meta<typeof SignupForm> = {
  title: 'Features/Auth/SignupForm',
  component: SignupForm,
  args: {
    userId: '',
    password: '',
    errors: { user_id: [], password: [] },
    generalErrors: [],
    submitting: false,
    onUserIdInput: () => {},
    onPasswordInput: () => {},
    onSubmit: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof SignupForm>;

export const Empty: Story = {};
export const Filled: Story = { args: { userId: 'alice', password: 'correcthorsebattery' } };
export const InvalidInput: Story = {
  args: {
    userId: 'a!',
    password: 'short',
    errors: { user_id: ['too_short', 'invalid_charset'], password: ['too_short'] },
  },
};
export const IdNotAvailable: Story = {
  args: {
    userId: 'alice',
    password: 'correcthorsebattery',
    errors: { user_id: ['already_taken'], password: [] },
  },
};
export const Submitting: Story = {
  args: { userId: 'alice', password: 'correcthorsebattery', submitting: true },
};
export const NetworkError: Story = {
  args: { userId: 'alice', password: 'correcthorsebattery', generalErrors: ['network_error'] },
};
