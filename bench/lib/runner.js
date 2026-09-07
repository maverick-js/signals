/**
 * Shared suite runner: rounds x interleaved samples x libraries, then one comparison table.
 *
 * Why rounds? V8 can settle a function into a noticeably faster or slower optimised state for the
 * lifetime of a process ("JIT bimodality"), and which library copy gets the lucky state is random.
 * Every round re-imports both libraries as fresh module instances, and for each library the round
 * with the lowest median is reported. Slow JIT states and GC pauses only ever add time, so the best
 * round is the most faithful estimate of what the code can do - for both sides alike.
 */

import kleur from 'kleur';
import { benchInterleaved, compare, matchesFilter, progress } from './harness.js';
import { createLoader, libEntries } from './load.js';

/**
 * @typedef {import('./harness.js').Stats} Stats
 * @typedef {import('./harness.js').Variant} Variant
 * @typedef {import('./load.js').Lib} Lib
 *
 * @typedef {object} SuiteItem
 * @property {string} name
 * @property {(lib: Lib, record: (count: number) => void) => Variant} make
 *   builds the variant for one library; `record(n)` stores a per-library sanity count
 *   (e.g. DOM mutations, computed executions) shown in `countColumn` and compared across libraries
 * @property {number} [samples] total samples override (split across rounds)
 * @property {number} [warmup]  per-round warm-up override
 */

/**
 * @param {object} options
 * @param {string} options.title
 * @param {SuiteItem[]} options.items
 * @param {ReturnType<typeof import('./harness.js').parseArgs>} options.args
 * @param {number} options.samples total samples per benchmark (split across rounds)
 * @param {number} options.warmup  warm-up iterations per round
 * @param {number} options.rounds
 * @param {string} [options.countColumn] header of the sanity-count column
 */
export async function runSuite({ title, items, args, samples, warmup, rounds, countColumn }) {
  const loader = await createLoader({ calibrate: args.calibrate });
  const selected = items.filter((item) => matchesFilter(item.name, args.filter));

  if (!selected.length) {
    console.log(`No ${title} benchmarks match --filter ${args.filter.join(',')}`);
    return [];
  }

  const perRound = (n) => Math.max(1, Math.ceil(n / rounds));

  console.log(
    `\n${title}: ${selected.length} benchmarks, ${rounds} round(s) x ${perRound(samples)} samples ` +
      `(+${warmup} warm-up)${args.quick ? ' [quick]' : ''}`,
  );

  const started = performance.now();

  /** @type {Map<string, Record<string, Stats[]>>} name -> label -> stats per round */
  const results = new Map(selected.map((item) => [item.name, {}]));
  /** @type {Map<string, Record<string, number>>} name -> label -> sanity count */
  const counts = new Map(selected.map((item) => [item.name, {}]));

  for (let round = 0; round < rounds; round++) {
    const libs = await loader.load(round);
    const entries = libEntries(libs);
    const prefix = rounds > 1 ? `[round ${round + 1}/${rounds}] ` : '';

    for (const item of selected) {
      progress(`${prefix}${item.name}`);

      /** @type {Record<string, Variant>} */
      const variants = {};
      for (const [label, lib] of entries) {
        variants[label] = item.make(lib, (count) => {
          counts.get(item.name)[label] = count;
        });
      }

      const result = benchInterleaved(item.name, variants, {
        warmup: item.warmup ?? warmup,
        samples: perRound(item.samples ?? samples),
      });

      const perLib = results.get(item.name);
      for (const [label, stats] of Object.entries(result)) {
        (perLib[label] ??= []).push(stats);
      }
    }
  }

  const rows = [];
  let mismatches = 0;

  for (const item of selected) {
    const perLib = results.get(item.name);
    const best = (label) => perLib[label]?.reduce((a, b) => (b.median < a.median ? b : a));

    /** @type {import('./harness.js').CompareRow} */
    const row = { name: item.name, current: best('current'), baseline: best('baseline') };

    if (countColumn) {
      const byLib = counts.get(item.name);
      const values = Object.values(byLib);
      const match = values.every((v) => v === values[0]);
      if (!match) {
        mismatches++;
        console.log(
          kleur.red(`  ${countColumn} mismatch for "${item.name}": `) +
            Object.entries(byLib)
              .map(([k, v]) => `${k}=${v}`)
              .join(', '),
        );
      }
      row.extra = {
        [countColumn]: match
          ? (values[0] ?? 0).toLocaleString()
          : kleur.red(
              Object.entries(byLib)
                .map(([k, v]) => `${k[0]}=${v}`)
                .join(' '),
            ),
      };
    }

    rows.push(row);
  }

  compare(rows, {
    title,
    columns: countColumn ? [countColumn] : [],
    baselineRef: loader.baselineRef,
    rounds,
    samples: perRound(samples),
  });

  if (mismatches) {
    console.log(
      kleur.red(
        `WARNING: ${mismatches} benchmark(s) reported different "${countColumn}" values for the two ` +
          'libraries - they are not doing equivalent work, so their timings are not comparable.',
      ),
    );
  }

  console.log(kleur.dim(`(${((performance.now() - started) / 1000).toFixed(1)}s)`));
  return rows;
}
