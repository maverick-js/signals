/// <reference types="vitest" />

import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __DEV__: 'true',
    __TEST__: 'true',
  },
  // https://vitest.dev/config
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
});
