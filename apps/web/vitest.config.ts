import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Don't accidentally pull in Next.js app code during unit tests; the
    // engine + leaderboard tests are pure and shouldn't touch any DB or
    // server-only module.
    exclude: ['node_modules', '.next', 'dist'],
  },
});
