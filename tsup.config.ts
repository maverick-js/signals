import { defineConfig, type Options } from 'tsup';

function options(dev = false): Options {
  return {
    entry: {
      index: 'src/index.ts',
      map: 'src/map.ts',
    },
    outDir: `dist/${dev ? 'dev' : 'prod'}`,
    treeshake: true,
    format: 'esm',
    bundle: true,
    dts: !dev,
    // minify: true,
    platform: 'browser',
    target: 'esnext',
    define: {
      __DEV__: dev ? 'true' : 'false',
      __TEST__: 'false',
    },
    esbuildOptions(opts) {
      opts.mangleProps = !dev ? /^_/ : undefined;
      opts.chunkNames = 'chunks/[name]-[hash]';
    },
  };
}

export default defineConfig([options(true), options(false)]);
