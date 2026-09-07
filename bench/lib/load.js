/**
 * Loads the library builds under test.
 *
 * - `current`  -> `dist/prod/index.js` + `dist/prod/map.js` (built by `rollup -c`)
 * - `baseline` -> `bench/.baseline/index.js` (built by `node bench/build-baseline.js <git-ref>`)
 *
 * Only built ESM output is ever imported - never `src/`.
 *
 * Both builds are snapshotted into a temp directory first so a concurrent `rollup -c` cannot swap
 * the code half way through a run. The snapshots are loaded with `createRequire` (Node's native
 * `require(esm)`) instead of `import()` on purpose: inside a vitest worker `import()` goes through
 * vite's module runner, which rewrites every cross-module reference into a getter access. That
 * would slow down the multi-file `dist/prod` build but not the single-file baseline bundle, and
 * the comparison would be meaningless. `require()` bypasses the module runner entirely.
 *
 * `BENCH_CALIBRATE=1` switches to an A/A test: the "baseline" becomes an independent second copy
 * of `dist/prod`, so both sides run identical code and every reported difference is pure noise.
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DIST_DIR = path.join(ROOT, 'dist', 'prod');
export const BASELINE_DIR = path.join(ROOT, 'bench', '.baseline');
export const BASELINE_FILE = path.join(BASELINE_DIR, 'index.js');
export const BASELINE_REF_FILE = path.join(BASELINE_DIR, 'REF');

const require = createRequire(import.meta.url);

/**
 * @typedef {object} Lib
 * @property {Function} signal
 * @property {Function} computed
 * @property {Function} effect
 * @property {Function} tick
 * @property {Function} root
 * @property {Function} createScope
 * @property {Function} getScope
 * @property {Function} scoped
 * @property {Function} onDispose
 * @property {Function} onError
 * @property {Function} getContext
 * @property {Function} setContext
 * @property {Function} peek
 * @property {Function} computedMap
 * @property {Function} computedKeyedMap
 * @property {Function} selector
 */

/**
 * @typedef {object} Libs
 * @property {Lib} current
 * @property {Lib} [baseline]
 * @property {string} [baselineRef] short description of the baseline (from `.baseline/REF`)
 */

/**
 * Loads `index.js` + `map.js` from a `dist/prod`-shaped directory and merges their exports into a
 * plain object (so hot loops never touch module-namespace getters).
 *
 * @param {string} dir
 * @returns {Lib}
 */
function loadDist(dir) {
  return { ...require(path.join(dir, 'index.js')), ...require(path.join(dir, 'map.js')) };
}

function requireDist() {
  if (!existsSync(path.join(DIST_DIR, 'index.js')) || !existsSync(path.join(DIST_DIR, 'map.js'))) {
    throw new Error(
      `Missing ${path.relative(ROOT, DIST_DIR)}/ - build it first: ./node_modules/.bin/rollup -c`,
    );
  }
}

/** Contents of `bench/.baseline/REF` as `ref (sha)`, or `undefined` when there is no baseline. */
export function readBaselineRef() {
  if (!existsSync(BASELINE_REF_FILE)) return undefined;
  const [ref, sha] = readFileSync(BASELINE_REF_FILE, 'utf8').trim().split('\n');
  return sha ? `${ref} (${sha.slice(0, 7)})` : ref;
}

/**
 * Snapshots and loads the libraries to benchmark.
 *
 * @param {{ calibrate?: boolean }} [options] `calibrate` defaults to `BENCH_CALIBRATE=1`
 * @returns {Libs}
 */
export function loadLibs({ calibrate = process.env.BENCH_CALIBRATE === '1' } = {}) {
  requireDist();

  const snapshot = mkdtempSync(path.join(os.tmpdir(), 'maverick-signals-bench-'));
  process.on('exit', () => rmSync(snapshot, { recursive: true, force: true }));

  const currentDir = path.join(snapshot, 'current');
  const baselineDir = path.join(snapshot, 'baseline');
  cpSync(DIST_DIR, currentDir, { recursive: true });

  /** @type {Libs} */
  const libs = { current: loadDist(currentDir) };

  if (calibrate) {
    // A separate copy of the files yields a separate module instance (own state + JIT feedback).
    cpSync(DIST_DIR, baselineDir, { recursive: true });
    libs.baseline = loadDist(baselineDir);
    libs.baselineRef = 'calibrate (independent copy of dist/prod)';
  } else if (existsSync(BASELINE_FILE)) {
    mkdirSync(baselineDir, { recursive: true });
    cpSync(BASELINE_FILE, path.join(baselineDir, 'index.js'));
    libs.baseline = { ...require(path.join(baselineDir, 'index.js')) };
    libs.baselineRef = readBaselineRef();
  }

  return libs;
}

/**
 * Returns `[label, lib]` pairs for every available library.
 *
 * @param {Libs} libs
 * @returns {Array<['current' | 'baseline', Lib]>}
 */
export function libEntries(libs) {
  /** @type {Array<['current' | 'baseline', Lib]>} */
  const entries = [['current', libs.current]];
  if (libs.baseline) entries.push(['baseline', libs.baseline]);
  return entries;
}
