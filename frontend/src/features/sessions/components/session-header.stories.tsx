import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { SessionHeader } from './session-header';

const session = {
  id: 'ses_01JBG00000E000000000000001',
  workout_date: '2026-10-31',
  started_at: '2026-10-31T09:00:00Z',
  ended_at: null,
  note: '胸の日',
  blocks: [],
};

const meta: Meta<typeof SessionHeader> = {
  title: 'Features/Sessions/SessionHeader',
  component: SessionHeader,
  args: {
    session,
    draft: undefined,
    confirmingDelete: false,
    busy: false,
    error: undefined,
    onEdit: () => {},
    onSave: () => {},
    onEnd: () => {},
    onAskDelete: () => {},
    onDelete: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof SessionHeader>;

export const Running: Story = {};
export const Ended: Story = { args: { session: { ...session, ended_at: '2026-10-31T10:00:00Z' } } };
export const Editing: Story = { args: { draft: { date: '2026-10-31', note: '胸の日' } } };
export const ConfirmingDelete: Story = { args: { confirmingDelete: true } };
export const Failed: Story = { args: { error: '保存できませんでした' } };
