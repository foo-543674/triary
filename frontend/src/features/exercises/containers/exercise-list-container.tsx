import { type JSX, Match, Switch } from 'solid-js';
import { ExerciseList } from '../components/exercise-list';
import { createExerciseListQuery } from '../queries/exercise-list';

type Props = { readonly detailPath: (id: string) => string };

export const ExerciseListContainer = (props: Props): JSX.Element => {
  const list = createExerciseListQuery();
  return (
    <Switch>
      <Match when={list.isPending}>
        <p class="py-6 text-gray-500" role="status">
          読み込み中…
        </p>
      </Match>
      <Match when={list.isError}>
        <p class="py-6 text-red-600" role="alert">
          種目を読み込めませんでした
        </p>
      </Match>
      <Match when={list.data}>
        {(data) => <ExerciseList exercises={data()} detailPath={props.detailPath} />}
      </Match>
    </Switch>
  );
};
