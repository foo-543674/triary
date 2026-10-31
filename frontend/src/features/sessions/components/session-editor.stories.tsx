import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import type { Exercise, Session } from '../../../api/client';
import { emptyDraft } from '../set-draft';
import { SessionEditor } from './session-editor';

const bench: Exercise = {
  id: 'exr_01JBG00000E000000000000001',
  name: 'ベンチプレス',
  owner: 'preset',
  measurement_kinds: [
    { kind: 'reps', required: true },
    { kind: 'weight', required: true },
  ],
  parent_id: null,
  depth: 0,
};
const plank: Exercise = {
  id: 'exr_01JBG00000E00000000000000D',
  name: 'プランク',
  owner: 'preset',
  measurement_kinds: [{ kind: 'time', required: true }],
  parent_id: null,
  depth: 0,
};

const empty: Session = {
  id: 'ses_01JBG00000E000000000000001',
  workout_date: '2026-10-31',
  started_at: '2026-10-31T09:00:00Z',
  ended_at: null,
  note: null,
  blocks: [],
};

const recorded: Session = {
  ...empty,
  note: '胸の日',
  blocks: [
    {
      id: 'blk_01JBG00000E000000000000001',
      session_id: empty.id,
      exercise_id: bench.id,
      exercise_name: bench.name,
      exercise_measurement_kinds: bench.measurement_kinds,
      order: 0,
      sets: [
        {
          id: 'set_01JBG00000E000000000000001',
          order: 0,
          reps: 8,
          weight_kg: 80.5,
          duration_seconds: null,
          interval_seconds: 120,
        },
        {
          id: 'set_01JBG00000E000000000000002',
          order: 1,
          reps: 6,
          weight_kg: 80.5,
          duration_seconds: null,
          interval_seconds: null,
        },
      ],
    },
    {
      id: 'blk_01JBG00000E000000000000002',
      session_id: empty.id,
      exercise_id: plank.id,
      exercise_name: plank.name,
      exercise_measurement_kinds: plank.measurement_kinds,
      order: 1,
      sets: [],
    },
  ],
};

const meta: Meta<typeof SessionEditor> = {
  title: 'Features/Sessions/SessionEditor',
  component: SessionEditor,
  args: {
    session: recorded,
    exercises: [bench, plank],
    chosenExercise: '',
    addingBlock: false,
    blockError: undefined,
    savingSet: false,
    draft: () => emptyDraft,
    draftErrors: () => ({}),
    onChooseExercise: () => {},
    onAddBlock: () => {},
    onEditDraft: () => {},
    onAssisted: () => {},
    onSaveSet: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof SessionEditor>;

export const JustStarted: Story = { args: { session: empty } };
export const WithBlocksAndSets: Story = {};
export const SetErrors: Story = {
  args: {
    draft: () => ({ ...emptyDraft, reps: '8' }),
    draftErrors: (blockId: string) =>
      blockId === recorded.blocks[0]?.id ? { weight_kg: '必須の項目です' } : {},
  },
};
export const Ended: Story = {
  args: { session: { ...recorded, ended_at: '2026-10-31T10:00:00Z' } },
};
