import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { TextField } from './text-field';

const meta: Meta<typeof TextField> = {
  title: 'Components/TextField',
  component: TextField,
  args: { id: 'field', label: 'ユーザー ID', value: '', onInput: () => {} },
};

export default meta;
type Story = StoryObj<typeof TextField>;

export const Empty: Story = {};
export const WithHint: Story = { args: { hint: '3〜32 文字の半角英数字と _ -' } };
export const Filled: Story = { args: { value: 'alice' } };
export const WithErrors: Story = {
  args: {
    value: 'a!',
    errors: [
      'ユーザー ID は 3 文字以上にしてください',
      'ユーザー ID に使えるのは半角英数字と _ - だけです',
    ],
  },
};
export const Password: Story = { args: { label: 'パスワード', type: 'password', value: 'secret' } };
