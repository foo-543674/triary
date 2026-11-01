import type { Preview } from 'storybook-solidjs-vite';
// The app's global stylesheet (Tailwind). Without it the stories render the
// components unstyled, unlike the app (src/index.tsx imports it).
import '../src/index.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /date$/i,
      },
    },
  },
};

export default preview;
