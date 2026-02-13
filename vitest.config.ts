import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Resolves a workspace-relative path from the current module URL.
 */
function resolveFromRoot(
  args: {
    relativePath: string;
  },
): string {
  return fileURLToPath(new URL(args.relativePath, import.meta.url));
}

export default defineConfig({
  resolve: {
    alias: {
      '@engine': resolveFromRoot({ relativePath: './engine' }),
      '@extensions': resolveFromRoot({ relativePath: './extensions' }),
      '@config': resolveFromRoot({ relativePath: './config' }),
      '@memory': resolveFromRoot({ relativePath: './memory' }),
      '@tests': resolveFromRoot({ relativePath: './tests' })
    }
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup-vitest.ts']
  }
});
