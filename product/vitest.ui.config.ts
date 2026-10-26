import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['./test-ui/**/*.test.{ts,tsx}'],
    setupFiles: ['./test-ui/setup.ts'],
    globals: false,
  },
});
