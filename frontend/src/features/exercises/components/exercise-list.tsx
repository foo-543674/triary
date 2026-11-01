import { A } from '@solidjs/router';
import { For, type JSX, Show } from 'solid-js';
import type { Exercise } from '../../../api/client';
import { measurementSummary } from '../labels';

type Props = {
  readonly exercises: readonly Exercise[];
  /** Link target of an exercise. */
  readonly detailPath: (id: string) => string;
};

/** Exercises with their measurements; presets are marked (US-4). */
export const ExerciseList = (props: Props): JSX.Element => (
  <Show
    when={props.exercises.length > 0}
    fallback={<p class="py-6 text-gray-500">種目がありません</p>}
  >
    <ul class="divide-y divide-gray-200">
      <For each={props.exercises}>
        {(exercise) => (
          <li>
            <A
              class="flex items-center justify-between py-3 hover:bg-gray-50"
              href={props.detailPath(exercise.id)}
            >
              <span style={{ 'padding-left': `${exercise.depth * 1.25}rem` }}>
                <span class="font-medium text-gray-900">{exercise.name}</span>
                <span class="ml-2 text-xs text-gray-500">
                  {measurementSummary(exercise.measurement_kinds)}
                </span>
              </span>
              <Show when={exercise.owner === 'preset'}>
                <span class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  プリセット
                </span>
              </Show>
            </A>
          </li>
        )}
      </For>
    </ul>
  </Show>
);
