import { MemoryRouter, Route } from '@solidjs/router';
import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import Home from './index';

describe('Home route', () => {
  it('renders the app name as a heading and offers sign-up', async () => {
    render(() => (
      <MemoryRouter>
        <Route path="/" component={Home} />
      </MemoryRouter>
    ));
    expect(await screen.findByRole('heading', { name: /triary/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'アカウントを作成' })).toHaveAttribute(
      'href',
      '/signup',
    );
  });
});
