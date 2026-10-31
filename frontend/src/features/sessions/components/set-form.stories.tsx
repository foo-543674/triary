import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { emptyDraft } from '../set-draft';
import { SetForm } from './set-form';

const meta: Meta<typeof SetForm> = {
  title: 'Features/Sessions/SetForm',
  component: SetForm,
  args: {
    blockId: 'blk',
    measurements: [
      { kind: 'reps', required: true },
      { kind: 'weight', required: false },
    ],
    draft: emptyDraft,
    errors: {},
    saving: false,
    editing: false,
    onCancel: () => {},
    onEdit: () => {},
    onAssisted: () => {},
    onSave: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof SetForm>;

export const RepsAndOptionalWeight: Story = {};
export const Assisted: Story = {
  args: { draft: { ...emptyDraft, reps: '5', weight: '10', assisted: true } },
};
export const EditingStoredSet: Story = {
  args: { editing: true, draft: { ...emptyDraft, reps: '8', weight: '80' } },
};
export const TimeOnly: Story = { args: { measurements: [{ kind: 'time', required: true }] } };
export const Errors: Story = {
  args: {
    draft: { ...emptyDraft, reps: '10000' },
    errors: { reps: '0〜9999 の整数で入力してください' },
  },
};
