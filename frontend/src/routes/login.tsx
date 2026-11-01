import { useNavigate } from '@solidjs/router';
import type { Component } from 'solid-js';
import { LoginFormContainer } from '../features/auth/containers/login-form-container';

/** `/login`: sign in, then go to the main screen. */
const LoginPage: Component = () => {
  const navigate = useNavigate();
  return (
    <LoginFormContainer signupPath="/signup" onSignedIn={() => navigate('/', { replace: true })} />
  );
};

export default LoginPage;
