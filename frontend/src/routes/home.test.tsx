import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import Home from './index';

describe('Home route', () => {
  it('renders the app name as a heading', () => {
    render(() => <Home />);
    expect(screen.getByRole('heading', { name: /triary/i })).toBeInTheDocument();
  });
});
