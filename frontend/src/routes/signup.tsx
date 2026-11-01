import { useNavigate } from '@solidjs/router';
import type { Component } from 'solid-js';
import { SignupFormContainer } from '../features/auth/containers/signup-form-container';

/** `/signup`: account creation. After success the user lands on the main screen (US-1). */
const SignupPage: Component = () => {
  const navigate = useNavigate();
  return <SignupFormContainer onSignedUp={() => navigate('/', { replace: true })} />;
};

export default SignupPage;
