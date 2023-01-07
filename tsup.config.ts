import { defineConfig, type Options } from 'tsup';

function options({ dev = false, server = false } = {}): Options {
  return {
    entry: {
      index: 'src/index.ts',
      map: 'src/map.ts',
    },
    outDir: `dist/${server ? 'server' : dev ? 'dev' : 'prod'}`,
    treeshake: true,
    bundle: true,
    splitting: true,
    format: server ? ['esm', 'cjs'] : 'esm',
    // minify: true,
    platform: server ? 'node' : 'browser',
    target: server ? 'node16' : 'esnext',
    define: {
      __DEV__: dev ? 'true' : 'false',
      __TEST__: 'false',
      __SERVER__: server ? 'true' : 'false',
    },
    esbuildOptions(opts) {
      opts.mangleProps = !dev ? /^_/ : undefined;
      opts.chunkNames = 'chunks/[name]-[hash]';
    },
  };
}

export default defineConfig([
  options({ dev: true }),
  options({ dev: false }),
  options({ dev: false, server: true }),
]);
