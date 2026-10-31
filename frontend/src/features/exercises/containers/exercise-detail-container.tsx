import { type JSX, Match, Switch } from 'solid-js';
import { ExerciseDetailView } from '../components/exercise-detail';
import { createExerciseQuery } from '../queries/exercise';
import { createExerciseListQuery } from '../queries/exercise-list';

type Props = { readonly exerciseId: string; readonly detailPath: (id: string) => string };

/** The exercise and, from the cached list, its neighbors in the progression tree. */
export const ExerciseDetailContainer = (props: Props): JSX.Element => {
  const exercise = createExerciseQuery(() => props.exerciseId);
  const list = createExerciseListQuery();
  const all = () => list.data ?? [];
  return (
    <Switch>
      <Match when={exercise.isPending}>
        <p class="py-6 text-gray-500" role="status">
          読み込み中…
        </p>
      </Match>
      <Match when={exercise.isError}>
        <p class="py-6 text-red-600" role="alert">
          種目を読み込めませんでした
        </p>
      </Match>
      <Match when={exercise.data === null}>
        <p class="py-6 text-gray-600">この種目は見つかりません</p>
      </Match>
      <Match when={exercise.data}>
        {(data) => (
          <ExerciseDetailView
            exercise={data()}
            parent={all().find((e) => e.id === data().parent_id)}
            children={all().filter((e) => e.parent_id === data().id)}
            detailPath={props.detailPath}
          />
        )}
      </Match>
    </Switch>
  );
};
