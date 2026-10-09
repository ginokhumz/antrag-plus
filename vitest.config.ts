import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['{schema,scraper,server}/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          include: ['web/**/*.test.tsx'],
          environment: 'jsdom',
          // Testing Library registers its between-test cleanup on the global afterEach,
          // without which rendered trees accumulate and queries match across tests.
          globals: true,
          setupFiles: ['./web/src/setupTests.ts'],
        },
      },
    ],
  },
});
