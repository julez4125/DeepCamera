import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@ainvr/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url)
      ),
      '@ainvr/contracts/': fileURLToPath(
        new URL('../../packages/contracts/src/', import.meta.url)
      ),
      '@ainvr/test-utils': fileURLToPath(
        new URL('../../packages/test-utils/src/index.ts', import.meta.url)
      ),
      '@ainvr/test-utils/': fileURLToPath(
        new URL('../../packages/test-utils/src/', import.meta.url)
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
