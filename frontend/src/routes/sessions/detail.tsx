import { useNavigate, useParams } from '@solidjs/router';
import type { Component } from 'solid-js';
import { SessionEditorContainer } from '../../features/sessions/containers/session-editor-container';

/** `/sessions/:id`: record or edit one session. */
const SessionPage: Component = () => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  return (
    <SessionEditorContainer
      sessionId={params.id}
      onDeleted={() => navigate('/', { replace: true })}
    />
  );
};

export default SessionPage;
