/**
 * Loads the library builds under test.
 *
 * - `current`  -> `dist/prod/index.js` + `dist/prod/map.js` (built by `rollup -c`)
 * - `baseline` -> `bench/.baseline/index.js` (built by `node bench/build-baseline.js <git-ref>`)
 *
 * Only built ESM output is ever imported - never `src/`.
 *
 * `createLoader()` snapshots both builds into a temp directory at start-up (so a concurrent
 * `rollup -c` cannot change the code half way through a run) and can hand out FRESH module
 * instances per round (`load(round)`), each with its own module state and JIT feedback.
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import kleur from 'kleur';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DIST_DIR = path.join(ROOT, 'dist', 'prod');
export const BASELINE_DIR = path.join(ROOT, 'bench', '.baseline');
export const BASELINE_FILE = path.join(BASELINE_DIR, 'index.js');
export const BASELINE_REF_FILE = path.join(BASELINE_DIR, 'REF');

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
 * @property {string} [baselineRef] short description of the baseline ref (from `.baseline/REF`)
 */

/** @param {string} file */
async function importFile(file) {
  return import(pathToFileURL(file).href);
}

/**
 * Imports `index.js` + `map.js` from a `dist/prod`-shaped directory and merges their exports.
 *
 * @param {string} dir
 * @returns {Promise<Lib>}
 */
async function importDist(dir) {
  const [index, map] = await Promise.all([
    importFile(path.join(dir, 'index.js')),
    importFile(path.join(dir, 'map.js')),
  ]);
  return { ...index, ...map };
}

function requireDist() {
  if (!existsSync(path.join(DIST_DIR, 'index.js')) || !existsSync(path.join(DIST_DIR, 'map.js'))) {
    console.error(
      kleur.red(`Missing ${path.relative(ROOT, DIST_DIR)}/ - build it first:\n`) +
        kleur.cyan('  ./node_modules/.bin/rollup -c'),
    );
    process.exit(1);
  }
}

function printMissingBaselineHint() {
  console.log(
    kleur.yellow('No baseline build found at ') +
      kleur.cyan(path.relative(ROOT, BASELINE_FILE)) +
      kleur.yellow(' - only `current` will be measured.\n') +
      kleur.dim('Create one with: ') +
      kleur.cyan('node bench/build-baseline.js [git-ref]') +
      kleur.dim(' (default ref: v6.0.0)'),
  );
}

function readBaselineRef() {
  if (!existsSync(BASELINE_REF_FILE)) return undefined;
  const [ref, sha] = readFileSync(BASELINE_REF_FILE, 'utf8').trim().split('\n');
  return sha ? `${ref} (${sha.slice(0, 7)})` : ref;
}

/**
 * @typedef {object} Loader
 * @property {boolean} hasBaseline
 * @property {string} [baselineRef]
 * @property {(round: number) => Promise<Libs>} load fresh module instances for the given round
 */

/**
 * @param {{ calibrate?: boolean, quiet?: boolean }} [options]
 *   `calibrate` - A/A test: instead of `bench/.baseline`, use an independent copy of `dist/prod`
 *   as the baseline. Both sides then run identical code and any reported delta is pure noise,
 *   which tells you how much to trust small deltas on this machine.
 * @returns {Promise<Loader>}
 */
export async function createLoader({ calibrate = false, quiet = false } = {}) {
  requireDist();

  const snapshot = mkdtempSync(path.join(os.tmpdir(), 'maverick-signals-bench-'));
  process.on('exit', () => rmSync(snapshot, { recursive: true, force: true }));

  const currentSnapshot = path.join(snapshot, 'current');
  const baselineSnapshot = path.join(snapshot, 'baseline');
  cpSync(DIST_DIR, currentSnapshot, { recursive: true });

  let hasBaseline = false;
  /** @type {string | undefined} */
  let baselineRef;

  if (calibrate) {
    cpSync(DIST_DIR, baselineSnapshot, { recursive: true });
    hasBaseline = true;
    baselineRef = 'calibrate';
    if (!quiet) {
      console.log(
        kleur.dim(`current:  ${path.relative(ROOT, DIST_DIR)}/\n`) +
          kleur.yellow('baseline: independent copy of dist/prod (--calibrate, A/A noise test)'),
      );
    }
  } else if (existsSync(BASELINE_FILE)) {
    mkdirSync(baselineSnapshot, { recursive: true });
    cpSync(BASELINE_FILE, path.join(baselineSnapshot, 'index.js'));
    hasBaseline = true;
    baselineRef = readBaselineRef();
    if (!quiet) {
      console.log(
        kleur.dim(
          `current:  ${path.relative(ROOT, DIST_DIR)}/\n` +
            `baseline: ${path.relative(ROOT, BASELINE_FILE)}${baselineRef ? ` [${baselineRef}]` : ''}`,
        ),
      );
    }
  } else if (!quiet) {
    printMissingBaselineHint();
  }

  return {
    hasBaseline,
    baselineRef,
    async load(round) {
      // Every round gets its own copy of the files so `import()` yields new module instances.
      const dir = path.join(snapshot, `round-${round}`);
      cpSync(currentSnapshot, path.join(dir, 'current'), { recursive: true });

      /** @type {Libs} */
      const libs = { current: await importDist(path.join(dir, 'current')), baselineRef };

      if (hasBaseline) {
        cpSync(baselineSnapshot, path.join(dir, 'baseline'), { recursive: true });
        libs.baseline = calibrate
          ? await importDist(path.join(dir, 'baseline'))
          : { ...(await importFile(path.join(dir, 'baseline', 'index.js'))) };
      }

      return libs;
    },
  };
}

/**
 * Convenience: loads a single set of libraries (round 0).
 *
 * @param {{ calibrate?: boolean }} [options]
 * @returns {Promise<Libs>}
 */
export async function loadLibs(options = {}) {
  const loader = await createLoader(options);
  return loader.load(0);
}

/**
 * Returns `[label, lib]` pairs in the order they should be benchmarked (baseline first).
 *
 * @param {Libs} libs
 * @returns {Array<['baseline' | 'current', Lib]>}
 */
export function libEntries(libs) {
  /** @type {Array<['baseline' | 'current', Lib]>} */
  const entries = [];
  if (libs.baseline) entries.push(['baseline', libs.baseline]);
  entries.push(['current', libs.current]);
  return entries;
}
