/**
 * Glue between the benchmark scenarios and Vitest's benchmark runner.
 *
 * `scenario()` registers ONE `describe()` whose body defines one `bench()` per available library
 * (`current`, plus `baseline` when `bench/.baseline` exists). Vitest groups the tasks of a
 * `describe` into a single comparison table. Per-library state lives in closure variables created
 * by hooks that are never timed: `beforeAll` / `afterAll` run once before the warm-up and once
 * before the run (tinybench's `setup` / `teardown`), `beforeEach` / `afterEach` run around every
 * iteration.
 */

import { bench, describe } from 'vite-plus/test';
import { libEntries } from './load.js';

/** `BENCH_QUICK=1`: smaller sizes, shorter runs (~1 minute for the whole suite). */
export const quick = process.env.BENCH_QUICK === '1';

/** Sink to defeat dead-code elimination. Assign results of benchmarked work to it. */
export const sink = { value: 0 };

/** @param {number} n */
export const range = (n) => Array.from({ length: n }, (_, i) => i);

/**
 * Default run options. Every task runs for at least `time` ms AND at least `iterations`
 * iterations (whichever is longer), after a short warm-up.
 */
export const RUN_OPTIONS = quick
  ? { time: 250, iterations: 3, warmupTime: 50, warmupIterations: 1 }
  : { time: 1_000, iterations: 5, warmupTime: 150, warmupIterations: 2 };

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
 * @param {Record<string, unknown>} [extra.options] overrides for {@link RUN_OPTIONS}
 * @param {(lib: Lib) => number} [extra.check]
 *   sanity check run ONCE per library while collecting; the returned counts (e.g. DOM mutations,
 *   computed executions) must be identical for every library, otherwise the libraries are not doing
 *   equivalent work and the file fails to collect
 * @param {string} [extra.checkLabel] what `check` counts (used in the error message)
 */
export function scenario(libs, name, make, { options, check, checkLabel = 'count' } = {}) {
  const entries = libEntries(libs);

  if (check) {
    const [[firstLabel, firstLib], ...rest] = entries;
    const expected = check(firstLib);
    for (const [label, lib] of rest) {
      const actual = check(lib);
      if (actual !== expected) {
        throw new Error(
          `${name}: ${checkLabel} differs - ${label} did ${actual}, ${firstLabel} did ${expected}`,
        );
      }
    }
  }

  describe(name, () => {
    for (const [label, lib] of entries) {
      const { fn, beforeAll, beforeEach, afterEach, afterAll } = make(lib);
      bench(label, fn, {
        ...RUN_OPTIONS,
        ...options,
        // Vitest only forwards the bench-level `setup` / `teardown` hooks to tinybench. Per-iteration
        // hooks are per-task options, so they are attached to the task from `setup` (tinybench
        // reads `task.opts.beforeEach` / `afterEach` around every timed call).
        setup(task) {
          if (beforeEach || afterEach) Object.assign(task.opts, { beforeEach, afterEach });
          beforeAll?.();
        },
        teardown() {
          afterAll?.();
        },
      });
    }
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
