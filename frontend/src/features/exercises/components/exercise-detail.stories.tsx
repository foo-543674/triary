import { MemoryRouter, Route } from '@solidjs/router';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { ExerciseDetailView } from './exercise-detail';

const pike = {
  id: 'exr_01JBG00000E000000000000008',
  name: 'パイクプッシュアップ',
  owner: 'preset' as const,
  measurement_kinds: [{ kind: 'reps' as const, required: true }],
  parent_id: null,
  depth: 0,
};
const hspu = {
  id: 'exr_01JBG00000E000000000000009',
  name: '倒立腕立て (HSPU)',
  owner: 'preset' as const,
  measurement_kinds: [{ kind: 'reps' as const, required: true }],
  parent_id: pike.id,
  depth: 1,
};

const meta: Meta<typeof ExerciseDetailView> = {
  title: 'Features/Exercises/ExerciseDetail',
  component: ExerciseDetailView,
  args: { detailPath: (id: string) => `/exercises/${id}` },
  render: (args) => (
    <MemoryRouter>
      <Route path="/" component={() => <ExerciseDetailView {...args} />} />
    </MemoryRouter>
  ),
};

export default meta;
type Story = StoryObj<typeof ExerciseDetailView>;

export const RootWithChild: Story = {
  args: {
    exercise: { ...pike, created_at: '2026-10-31T00:00:00Z' },
    parent: undefined,
    children: [hspu],
  },
};
export const ChildOfPreset: Story = {
  args: { exercise: { ...hspu, created_at: '2026-10-31T00:00:00Z' }, parent: pike, children: [] },
};
export const OwnExercise: Story = {
  args: {
    exercise: {
      ...hspu,
      id: 'exr_01JBG00000E0000000000000ZZ',
      name: '壁倒立腕立て',
      owner: 'user',
      measurement_kinds: [
        { kind: 'reps', required: true },
        { kind: 'weight', required: false },
      ],
      created_at: '2026-10-31T00:00:00Z',
    },
    parent: hspu,
    children: [],
  },
};
