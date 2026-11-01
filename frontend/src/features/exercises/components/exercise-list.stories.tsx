import { MemoryRouter, Route } from '@solidjs/router';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import type { Exercise } from '../../../api/client';
import { ExerciseList } from './exercise-list';

const sample: readonly Exercise[] = [
  {
    id: 'exr_01JBG00000E000000000000001',
    name: 'ベンチプレス',
    owner: 'preset',
    measurement_kinds: [
      { kind: 'reps', required: true },
      { kind: 'weight', required: true },
    ],
    parent_id: null,
    depth: 0,
  },
  {
    id: 'exr_01JBG00000E000000000000008',
    name: 'パイクプッシュアップ',
    owner: 'preset',
    measurement_kinds: [{ kind: 'reps', required: true }],
    parent_id: null,
    depth: 0,
  },
  {
    id: 'exr_01JBG00000E000000000000009',
    name: '倒立腕立て (HSPU)',
    owner: 'preset',
    measurement_kinds: [{ kind: 'reps', required: true }],
    parent_id: 'exr_01JBG00000E000000000000008',
    depth: 1,
  },
  {
    id: 'exr_01JBG00000E0000000000000ZZ',
    name: '壁倒立腕立て',
    owner: 'user',
    measurement_kinds: [{ kind: 'reps', required: true }],
    parent_id: 'exr_01JBG00000E000000000000009',
    depth: 2,
  },
];

const meta: Meta<typeof ExerciseList> = {
  title: 'Features/Exercises/ExerciseList',
  component: ExerciseList,
  args: { exercises: sample, detailPath: (id: string) => `/exercises/${id}` },
  render: (args) => (
    <MemoryRouter>
      <Route path="/" component={() => <ExerciseList {...args} />} />
    </MemoryRouter>
  ),
};

export default meta;
type Story = StoryObj<typeof ExerciseList>;

export const Mixed: Story = {};
export const Empty: Story = { args: { exercises: [] } };
