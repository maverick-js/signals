/**
 * Builds a BASELINE bundle of the library from a git ref so the benchmarks can compare the current
 * `dist/prod/` build against it.
 *
 *   node bench/build-baseline.js            # defaults to v6.0.0
 *   node bench/build-baseline.js HEAD
 *   node bench/build-baseline.js main~3
 *   node bench/build-baseline.js <sha>
 *
 * The `src/*.ts` files at the ref are extracted with `git show` into a temp dir and bundled with
 * esbuild into a SINGLE file `bench/.baseline/index.js` (index + map share one module instance of
 * core). The ref and its commit sha are written to `bench/.baseline/REF`.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import kleur from 'kleur';
import { BASELINE_DIR, BASELINE_FILE, BASELINE_REF_FILE, ROOT } from './lib/load.js';

const ref = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 'v6.0.0';

/** @param {string[]} args */
function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

let sha;
try {
  sha = git(['rev-parse', '--verify', `${ref}^{commit}`]).trim();
} catch {
  console.error(kleur.red(`Unknown git ref: ${ref}`));
  process.exit(1);
}

const files = git(['ls-tree', '-r', '--name-only', sha, 'src'])
  .split('\n')
  .map((f) => f.trim())
  .filter((f) => f && f.endsWith('.ts'));

if (!files.includes('src/index.ts')) {
  console.error(kleur.red(`No src/index.ts at ${ref} (${sha})`));
  process.exit(1);
}

const tmp = mkdtempSync(path.join(os.tmpdir(), 'maverick-signals-baseline-'));
const tmpSrc = path.join(tmp, 'src');
mkdirSync(tmpSrc, { recursive: true });

try {
  for (const file of files) {
    const dest = path.join(tmp, file);
    mkdirSync(path.dirname(dest), { recursive: true });
    // Binary-safe copy of the blob at the ref.
    const content = execFileSync('git', ['show', `${sha}:${file}`], { cwd: ROOT });
    writeFileSync(dest, content);
  }

  const hasMap = files.includes('src/map.ts');
  writeFileSync(
    path.join(tmpSrc, 'entry.ts'),
    `export * from './index';\n${hasMap ? "export * from './map';\n" : ''}`,
  );

  mkdirSync(BASELINE_DIR, { recursive: true });

  const result = await build({
    absWorkingDir: tmp,
    entryPoints: [path.join(tmpSrc, 'entry.ts')],
    outfile: BASELINE_FILE,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'esnext',
    treeShaking: true,
    define: { __DEV__: 'false', __TEST__: 'false' },
    mangleProps: /^_/,
    logLevel: 'warning',
    // Don't pick up any tsconfig from the temp dir's ancestors.
    tsconfigRaw: { compilerOptions: { target: 'esnext', useDefineForClassFields: false } },
    banner: {
      js: `// baseline build of @maverick-js/signals @ ${ref} (${sha}) - generated, do not edit`,
    },
  });

  if (result.errors.length) {
    console.error(kleur.red('esbuild reported errors'));
    process.exit(1);
  }

  writeFileSync(BASELINE_REF_FILE, `${ref}\n${sha}\n`);

  const size = statSync(BASELINE_FILE).size;
  console.log(
    kleur.green('Baseline built: ') +
      kleur.cyan(path.relative(ROOT, BASELINE_FILE)) +
      kleur.dim(` (${(size / 1024).toFixed(1)} kB) from `) +
      kleur.bold(`${ref}`) +
      kleur.dim(` @ ${sha.slice(0, 12)}`),
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
