// One command for every test: `npm test`. `npm run coverage` adds the two gates:
// 80% over all application code, 100% over src/services, where the rules live.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{js,jsx}'],
    // Starts a throwaway PostgreSQL (or uses DATABASE_URL_TEST) and migrates it once.
    globalSetup: ['tests/setup/global-db.js'],
    // The database tests share one database and reset it per test, so files run one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'client/src/**/*.{js,jsx}', 'mcp-server/eventhub-tools.js'],
      // Entry points that only wire things together and start a process.
      exclude: ['src/server.js', 'client/src/main.jsx'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
        'src/services/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
      },
    },
  },
});
