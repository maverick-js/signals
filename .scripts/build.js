import { build } from 'esbuild';

/** @type {Record<string, string>} */
const mangleCache = {
  _changed: 'c',
  _compute: 'p',
  _context: 'x',
  _disposal: 'd',
  _handlers: 'h',
  _key: 'k',
  _next: 'n',
  _nextReaction: 'x',
  _nextSignal: 's',
  _parent: 'm',
  _prev: 'l',
  _prevReaction: 'q',
  _prevSignal: 't',
  _effect: 'r',
  _reactions: 'u',
  _reactionsTail: 'a',
  _refs: 'o',
  _scope: 's',
  _signal: 'g',
  _signals: 'y',
  _signalsTail: 'b',
  _state: 'ø',
  _value: 'v',
  _version: 'e',
};

const entryPoints = [
  'src/index.ts',
  // 'src/map.ts',
  // 'src/selector.ts'
];

await build(options(entryPoints, true));
await build(options(entryPoints, false));

/**
 * @returns {import('esbuild').BuildOptions}
 */
function options(entryPoints, dev) {
  return {
    bundle: true,
    chunkNames: '[name].js',
    define: {
      __DEV__: dev ? 'true' : 'false',
      __TEST__: 'false',
    },
    entryPoints,
    format: 'esm',
    mangleCache,
    mangleProps: !dev ? /^_/ : undefined,
    outdir: `dist/${dev ? 'dev' : 'prod'}`,
    platform: 'neutral',
    target: 'esnext',
    treeShaking: true,
    tsconfig: 'tsconfig.build.json',
  };
}
