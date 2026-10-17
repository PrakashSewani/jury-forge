import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['./test-ui/**/*.test.tsx'],
    setupFiles: ['./test-ui/setup.ts'],
    globals: false,
  },
});
