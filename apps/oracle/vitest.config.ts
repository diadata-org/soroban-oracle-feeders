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
    alias: {
      '@repo/common': resolve(__dirname, '../packages/common/src'),
      '@repo/typescript-config': resolve(__dirname, '../packages/typescript-config'),
    },
  },
  esbuild: {
    target: 'node18',
  },
}); 
