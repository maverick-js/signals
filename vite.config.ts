import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __DEV__: 'true',
    __TEST__: 'true',
  },
});
