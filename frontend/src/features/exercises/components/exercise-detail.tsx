import { A } from '@solidjs/router';
import { For, type JSX, Show } from 'solid-js';
import type { Exercise, ExerciseDetail } from '../../../api/client';
import { kindLabel } from '../labels';

type Props = {
  readonly exercise: ExerciseDetail;
  /** The parent in the progression tree, when there is one. */
  readonly parent: Exercise | undefined;
  readonly children: readonly Exercise[];
  readonly detailPath: (id: string) => string;
};

/** One exercise: measurements and its place in the progression tree (US-4). */
export const ExerciseDetailView = (props: Props): JSX.Element => (
  <article class="flex flex-col gap-4 py-6">
    <header class="flex items-center gap-3">
      <h1 class="text-2xl font-bold text-gray-900">{props.exercise.name}</h1>
      <Show when={props.exercise.owner === 'preset'}>
        <span class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          プリセット (編集不可)
        </span>
      </Show>
    </header>
    <section>
      <h2 class="text-sm font-semibold text-gray-700">記録する項目</h2>
      <ul class="mt-1 text-gray-800">
        <For each={props.exercise.measurement_kinds}>
          {(m) => (
            <li>
              {kindLabel(m.kind)}: {m.required ? '必須' : '任意'}
            </li>
          )}
        </For>
      </ul>
    </section>
    <section>
      <h2 class="text-sm font-semibold text-gray-700">プログレッション</h2>
      <Show when={props.parent} fallback={<p class="text-gray-500">前段の種目はありません</p>}>
        {(parent) => (
          <p>
            前段:{' '}
            <A class="text-green-700 underline" href={props.detailPath(parent().id)}>
              {parent().name}
            </A>
          </p>
        )}
      </Show>
      <Show when={props.children.length > 0}>
        <p>
          次の段階:{' '}
          <For each={props.children}>
            {(child, index) => (
              <>
                {index() > 0 ? '、' : ''}
                <A class="text-green-700 underline" href={props.detailPath(child.id)}>
                  {child.name}
                </A>
              </>
            )}
          </For>
        </p>
      </Show>
    </section>
  </article>
);
