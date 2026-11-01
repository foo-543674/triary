import type { Component } from 'solid-js';
import { HistoryListContainer } from '../../features/history/containers/history-list-container';

/** `/history`: past sessions by date (US-9). A session opens in the editor. */
const HistoryPage: Component = () => (
  <section class="py-6">
    <h1 class="mb-2 text-2xl font-bold text-gray-900">履歴</h1>
    <HistoryListContainer sessionPath={(id) => `/sessions/${id}`} />
  </section>
);

export default HistoryPage;
