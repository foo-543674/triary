import { MemoryRouter, Route } from '@solidjs/router';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { LoginForm } from './login-form';

const meta: Meta<typeof LoginForm> = {
  title: 'Features/Auth/LoginForm',
  component: LoginForm,
  args: {
    userId: '',
    password: '',
    errors: { user_id: [], password: [] },
    generalErrors: [],
    submitting: false,
    signupPath: '/signup',
    onUserIdInput: () => {},
    onPasswordInput: () => {},
    onSubmit: () => {},
  },
  // The sign-up link is an <A>, which needs a router.
  render: (args) => (
    <MemoryRouter>
      <Route path="/" component={() => <LoginForm {...args} />} />
    </MemoryRouter>
  ),
};

export default meta;
type Story = StoryObj<typeof LoginForm>;

export const Empty: Story = {};
export const MissingFields: Story = {
  args: { errors: { user_id: ['required'], password: ['required'] } },
};
export const WrongCredentials: Story = {
  args: { userId: 'alice', password: 'wrongpassword', generalErrors: ['invalid_credentials'] },
};
export const Submitting: Story = {
  args: { userId: 'alice', password: 'correcthorsebattery', submitting: true },
};
