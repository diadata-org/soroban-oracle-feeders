import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'build'],
  },
  resolve: {
    alias: [
      {
        find: '@repo/common',
        replacement: resolve(__dirname, '../packages/common/src'),
      },
      {
        find: '@repo/typescript-config',
        replacement: resolve(__dirname, '../packages/typescript-config'),
      },
    ],
  },
  esbuild: {
    target: 'node18',
  },
}); 
