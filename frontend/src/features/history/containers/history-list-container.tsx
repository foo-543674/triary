import { type JSX, Match, Switch } from 'solid-js';
import { HistoryList } from '../components/history-list';
import { createSessionsByDateQuery } from '../queries/sessions-by-date';

type Props = { readonly sessionPath: (id: string) => string };

export const HistoryListContainer = (props: Props): JSX.Element => {
  const history = createSessionsByDateQuery();
  return (
    <Switch>
      <Match when={history.isPending}>
        <p class="py-6 text-gray-500" role="status">
          読み込み中…
        </p>
      </Match>
      <Match when={history.isError}>
        <p class="py-6 text-red-600" role="alert">
          履歴を読み込めませんでした
        </p>
      </Match>
      <Match when={history.data}>
        {(data) => (
          <HistoryList
            sessions={data().pages.flatMap((page) => page.items)}
            hasMore={history.hasNextPage}
            loadingMore={history.isFetchingNextPage}
            sessionPath={props.sessionPath}
            onLoadMore={() => void history.fetchNextPage()}
          />
        )}
      </Match>
    </Switch>
  );
};
