import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';

/** @type {Record<string, string>} */
const mangleCache = {
  _key: '$k',
  _effect: '$e',
  _nodes: '$n',
  _refs: '$r',
  _init: '$i',
  _value: '$v',
  _sources: '$s',
  _observers: '$o',
  _compute: '$c',
  _changed: '$ch',
  _state: '$st',
  _prevSibling: '$ps',
  _nextSibling: '$ns',
  _context: '$cx',
  _handlers: '$eh',
  _disposal: '$d',
};

export default defineConfig([
  // dev
  define({ dev: true }),
  // prod
  define({ dev: false }),
]);

/** @returns {import('rollup').RollupOptions} */
function define({ dev = false }) {
  return {
    input: ['src/index.ts', 'src/core.ts', 'src/signals.ts', 'src/map.ts', 'src/symbols.ts'],
    treeshake: true,
    output: {
      format: 'esm',
      dir: `dist/${dev ? 'dev' : 'prod'}`,
      chunkFileNames: '[name].js',
    },
    plugins: [
      esbuild({
        target: 'esnext',
        platform: 'neutral',
        tsconfig: 'tsconfig.build.json',
        define: {
          __DEV__: dev ? 'true' : 'false',
          __TEST__: 'false',
        },
        mangleProps: !dev ? /^_/ : undefined,
        mangleCache,
      }),
    ],
  };
}
