import type { Component } from 'solid-js';
import { ExerciseListContainer } from '../../features/exercises/containers/exercise-list-container';

/** `/exercises`: the exercises the user can record. */
const ExercisesPage: Component = () => (
  <section class="py-6">
    <h1 class="mb-2 text-2xl font-bold text-gray-900">種目</h1>
    <ExerciseListContainer detailPath={(id) => `/exercises/${id}`} />
  </section>
);

export default ExercisesPage;
