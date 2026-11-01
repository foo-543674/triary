import { MemoryRouter, Route } from '@solidjs/router';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import type { SessionSummary } from '../../../api/client';
import { HistoryList } from './history-list';

const sessions: readonly SessionSummary[] = [
  {
    id: 'ses_01JBG00000E000000000000002',
    workout_date: '2026-10-31',
    started_at: '2026-10-31T09:00:00Z',
    ended_at: null,
    block_count: 2,
    set_count: 7,
    exercise_summary: [
      { exercise_id: 'exr_01JBG00000E000000000000001', exercise_name: 'ベンチプレス' },
      { exercise_id: 'exr_01JBG00000E00000000000000D', exercise_name: 'プランク' },
    ],
  },
  {
    id: 'ses_01JBG00000E000000000000001',
    workout_date: '2026-10-29',
    started_at: '2026-10-29T09:00:00Z',
    ended_at: '2026-10-29T10:00:00Z',
    block_count: 1,
    set_count: 5,
    exercise_summary: [
      { exercise_id: 'exr_01JBG00000E000000000000002', exercise_name: 'バックスクワット' },
    ],
  },
];

const meta: Meta<typeof HistoryList> = {
  title: 'Features/History/HistoryList',
  component: HistoryList,
  args: {
    sessions,
    hasMore: false,
    loadingMore: false,
    sessionPath: (id: string) => `/sessions/${id}`,
    onLoadMore: () => {},
  },
  render: (args) => (
    <MemoryRouter>
      <Route path="/" component={() => <HistoryList {...args} />} />
    </MemoryRouter>
  ),
};

export default meta;
type Story = StoryObj<typeof HistoryList>;

export const Some: Story = {};
export const MoreToLoad: Story = { args: { hasMore: true } };
export const LoadingMore: Story = { args: { hasMore: true, loadingMore: true } };
export const Empty: Story = { args: { sessions: [] } };
