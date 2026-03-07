import { defineConfig } from 'tsup';

/**
 * Defines bundle output for publishable npm CLI distribution.
 */
export default defineConfig([
  {
    entry: ['engine/cli/main.ts'],
    format: ['esm'],
    platform: 'node',
    target: 'node20',
    outDir: 'dist',
    clean: true,
    dts: true,
    splitting: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    entry: ['engine/toolkit/index.ts'],
    format: ['esm'],
    platform: 'node',
    target: 'node20',
    outDir: 'dist',
    clean: false,
    dts: true,
    splitting: false,
  },
]);
