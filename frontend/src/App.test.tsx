import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the header with the app name', () => {
    render(() => <App />);
    // Layout は router の解決前に描画されるので、ヘッダは同期的に assert できる。
    expect(screen.getByRole('link', { name: /triary/i })).toBeInTheDocument();
  });
});
