import { defineConfig } from 'vitest/config';

const sources = ['apps/*/src/**/*.test.ts', 'packages/*/src/**/*.test.ts', 'scripts/**/*.test.ts'];
const integration = '**/*.int.test.ts';
const fixtures = 'scripts/fixtures/**';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: sources,
          exclude: ['**/node_modules/**', integration, fixtures],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: [integration],
          exclude: ['**/node_modules/**'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts', 'scripts/**/*.ts'],
      exclude: ['**/*.test.ts', 'packages/testkit/**', fixtures],
      reporter: ['text-summary', 'json-summary'],
      thresholds: {
        // technical-approach.md §20: new code in `domain` keeps >= 90 % branch coverage.
        'packages/domain/src/**/*.ts': { branches: 90, functions: 90, lines: 90, statements: 90 },
      },
    },
  },
});
