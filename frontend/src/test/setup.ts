import '@testing-library/jest-dom/vitest';
import { cleanup } from '@solidjs/testing-library';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '../mocks/server';

// MSW: テスト間でハンドラのリークを避けるため、通常の lifecycle hook を全部仕込む。
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
