import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { AccountMenu } from './account-menu';

const meta: Meta<typeof AccountMenu> = {
  title: 'Features/Auth/AccountMenu',
  component: AccountMenu,
  args: { userId: 'alice', signingOut: false, signOutFailed: false, onSignOut: () => {} },
};

export default meta;
type Story = StoryObj<typeof AccountMenu>;

export const SignedIn: Story = {};
export const SigningOut: Story = { args: { signingOut: true } };
export const SignOutFailed: Story = { args: { signOutFailed: true } };
