import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the greeting copy', () => {
    render(() => <App />);
    expect(screen.getByText(/hello tailwind/i)).toBeInTheDocument();
  });
});
