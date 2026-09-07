import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEV__: 'true',
    __TEST__: 'true',
  },
  test: {
    globals: true,
    // Required by `tests/gc.test.ts` so `global.gc` is available inside the worker.
    execArgv: ['--expose-gc'],
    benchmark: {
      include: ['bench/**/*.bench.js'],
    },
  },
});
