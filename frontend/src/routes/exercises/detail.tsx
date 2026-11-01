import { useParams } from '@solidjs/router';
import type { Component } from 'solid-js';
import { ExerciseDetailContainer } from '../../features/exercises/containers/exercise-detail-container';

/** `/exercises/:id`. */
const ExerciseDetailPage: Component = () => {
  const params = useParams<{ id: string }>();
  return <ExerciseDetailContainer exerciseId={params.id} detailPath={(id) => `/exercises/${id}`} />;
};

export default ExerciseDetailPage;
