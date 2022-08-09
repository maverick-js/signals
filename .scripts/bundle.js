import { build } from 'esbuild';

async function main() {
  /** @returns {import('esbuild').BuildOptions} */
  function options({ dev = false }) {
    return {
      entryPoints: ['src/index.ts'],
      outfile: `dist/${dev ? 'dev' : 'prod'}/index.js`,
      treeShaking: true,
      format: 'esm',
      bundle: true,
      platform: 'browser',
      target: 'es2019',
      write: true,
      watch: hasArg('-w'),
      minify: !dev,
      define: {
        __DEV__: dev ? 'true' : 'false',
      },
      external: ['@maverick-js/scheduler'],
    };
  }

  await Promise.all([build(options({ dev: true })), build(options({ dev: false }))]);
}

function hasArg(arg) {
  return process.argv.includes(arg);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
