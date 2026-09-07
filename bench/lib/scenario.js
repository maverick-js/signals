/**
 * Glue between the benchmark scenarios and vitest's `bench` fixture.
 *
 * `scenario()` registers ONE `test()` whose body creates one `bench()` per available library
 * (`current`, plus `baseline` when `bench/.baseline` exists), then runs them with
 * `bench.compare()` (2 libraries) or `.run()` (1 library). Per-library state lives in closure
 * variables created by the tinybench task hooks (`beforeAll` / `beforeEach` / `afterEach` /
 * `afterAll`), which are never timed.
 */

import { expect, test } from 'vitest';
import { libEntries } from './load.js';

/** `BENCH_QUICK=1`: smaller sizes, shorter runs (~1 minute for the whole suite). */
export const quick = process.env.BENCH_QUICK === '1';

/** Sink to defeat dead-code elimination. Assign results of benchmarked work to it. */
export const sink = { value: 0 };

/** @param {number} n */
export const range = (n) => Array.from({ length: n }, (_, i) => i);

/**
 * Default tinybench run options. Every task runs for at least `time` ms AND at least `iterations`
 * iterations (whichever is longer), after a short warm-up.
 *
 * @type {import('vitest').BenchRunOptions}
 */
export const RUN_OPTIONS = quick
  ? { time: 250, iterations: 3, warmupTime: 50, warmupIterations: 1 }
  : { time: 1_000, iterations: 5, warmupTime: 150, warmupIterations: 2 };

/** A single scenario can legitimately take a while (two libraries x warm-up + run). */
const TEST_TIMEOUT = 10 * 60_000;

/**
 * @typedef {import('./load.js').Lib} Lib
 * @typedef {import('./load.js').Libs} Libs
 *
 * @typedef {object} Variant
 * @property {() => void} fn                  timed
 * @property {() => void} [beforeAll]         untimed, once before the warm-up and once before the run
 * @property {() => void} [beforeEach]        untimed, before every iteration
 * @property {() => void} [afterEach]         untimed, after every iteration
 * @property {() => void} [afterAll]          untimed, once after the warm-up and once after the run
 */

/**
 * @param {Libs} libs
 * @param {string} name
 * @param {(lib: Lib) => Variant} make builds the variant (fn + hooks) for one library
 * @param {object} [extra]
 * @param {import('vitest').BenchRunOptions} [extra.options] overrides for {@link RUN_OPTIONS}
 * @param {(lib: Lib) => number} [extra.check]
 *   sanity check run ONCE per library before benchmarking; the returned counts (e.g. DOM
 *   mutations, computed executions) must be identical for every library, otherwise the libraries
 *   are not doing equivalent work and the test fails
 * @param {string} [extra.checkLabel] what `check` counts (used in the assertion message)
 */
export function scenario(libs, name, make, { options, check, checkLabel = 'count' } = {}) {
  const entries = libEntries(libs);

  test(name, { timeout: TEST_TIMEOUT }, async ({ bench }) => {
    if (check) {
      const [[firstLabel, firstLib], ...rest] = entries;
      const expected = check(firstLib);
      for (const [label, lib] of rest) {
        expect(check(lib), `${checkLabel}: ${label} vs ${firstLabel}`).toBe(expected);
      }
    }

    const registrations = entries.map(([label, lib]) => {
      const { fn, ...hooks } = make(lib);
      return bench(label, hooks, fn);
    });

    const runOptions = { ...RUN_OPTIONS, ...options };
    if (registrations.length > 1) await bench.compare(...registrations, runOptions);
    else await registrations[0].run(runOptions);
  });
}

/**
 * Runs `init` inside a `root` and returns its result merged with the root's `dispose`.
 *
 * @template T
 * @param {Lib} lib
 * @param {() => T} init
 * @returns {T & { dispose: () => void }}
 */
export function withRoot(lib, init) {
  let dispose;
  const ctx = lib.root((d) => {
    dispose = d;
    return init();
  });
  return { ...ctx, dispose };
}
