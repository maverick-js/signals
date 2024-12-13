import { build } from 'esbuild';

/** @type {Record<string, string>} */
const mangleCache = {
  _child: 'c',
  _compute: 'ƒ',
  _context: 'µ',
  _disposal: 'd',
  _effect: 'e',
  _handlers: 'h',
  _head: 'a',
  _key: 'k',
  _next: 'n',
  _nextReaction: 'r',
  _nextSignal: 's',
  _node: 'o',
  _parent: 'x',
  _prev: 'l',
  _prevReaction: 'q',
  _prevSignal: 'z',
  _reactions: 'u',
  _reactionsTail: 't',
  _refs: 'f',
  _scope: 'ß',
  _signal: 'i',
  _signals: 'y',
  _signalsTail: 'w',
  _state: 'ø',
  _tail: 'b',
  _value: 'v',
  _version: 'j',
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
