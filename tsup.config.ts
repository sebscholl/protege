import { defineConfig } from 'tsup';

/**
 * Defines bundle output for publishable npm CLI distribution.
 */
export default defineConfig({
  entry: ['engine/cli/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  splitting: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
