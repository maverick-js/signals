import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';

/** @type {Record<string, string>} */
const mangleCache = {
  _changed: '$g',
  _compute: '$c',
  _context: '$x',
  _disposal: '$d',
  _effect: '$e',
  _handlers: '$h',
  _init: '$i',
  _key: '$k',
  _nextSibling: '$f',
  _prevSibling: '$l',
  _nodes: '$n',
  _observers: '$o',
  _refs: '$r',
  _sources: '$s',
  _state: '$u',
  _value: '$v',
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
