import { defineConfig } from 'vitest/config';

import { fileURLToPath } from 'node:url';

const rootDirPath = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@relay': rootDirPath,
      '@tests': `${rootDirPath}tests`,
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
