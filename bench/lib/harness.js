/**
 * Tiny dependency-free benchmark harness (only `cli-table` + `kleur` for output).
 *
 * - `bench(name, fn, opts)` times a single function.
 * - `benchInterleaved(name, variants, opts)` times several variants (e.g. `baseline` and `current`)
 *   in the same process, alternating between them sample by sample so JIT warm-up, GC pressure and
 *   CPU frequency drift affect both variants roughly equally.
 * - `compare(rows)` prints a `current` vs `baseline` table with coloured deltas.
 * - `rng(seed)` is a seeded PRNG (mulberry32) so every library sees the identical random sequence.
 *
 * Lower is always better. All times are in milliseconds.
 */

import Table from 'cli-table';
import kleur from 'kleur';
import { spawnSync } from 'node:child_process';

/** Threshold (in %) below which a delta is considered noise. */
export const NEUTRAL_THRESHOLD = 5;

// ---------------------------------------------------------------------------------------
// PRNG
// ---------------------------------------------------------------------------------------

/**
 * mulberry32 - a fast 32-bit seeded PRNG. Returns a function producing floats in `[0, 1)`.
 * The returned function also exposes `int(maxExclusive)` and `pick(array)` helpers.
 *
 * @param {number} seed
 */
export function rng(seed) {
  let a = seed >>> 0;

  /** @returns {number} float in [0, 1) */
  function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** @param {number} max @returns {number} integer in [0, max) */
  next.int = (max) => Math.floor(next() * max);
  /** @template T @param {readonly T[]} array @returns {T} */
  next.pick = (array) => array[Math.floor(next() * array.length)];

  return next;
}

/**
 * In-place Fisher-Yates shuffle driven by a seeded `rng`.
 *
 * @template T
 * @param {T[]} array
 * @param {() => number} rand
 * @returns {T[]}
 */
export function shuffle(array, rand) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = array[i];
    array[i] = array[j];
    array[j] = t;
  }
  return array;
}

// ---------------------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------------------

/** Runs a full GC when node was started with `--expose-gc`. */
export function gc() {
  if (typeof globalThis.gc === 'function') globalThis.gc();
}

/**
 * Re-executes the current script with `--expose-gc` when `globalThis.gc` is unavailable so that
 * samples can be separated by a full collection. Returns `true` when the caller should exit (the
 * child process already ran and printed everything).
 */
export function ensureExposeGC() {
  if (typeof globalThis.gc === 'function') return false;
  if (process.execArgv.includes('--expose-gc') || process.env.BENCH_NO_RESPAWN) return false;

  const result = spawnSync(
    process.execPath,
    ['--expose-gc', ...process.execArgv, ...process.argv.slice(1)],
    { stdio: 'inherit', env: { ...process.env, BENCH_NO_RESPAWN: '1' } },
  );

  process.exitCode = result.status ?? 1;
  return true;
}

/**
 * @typedef {object} Stats
 * @property {string} name
 * @property {number} median  median sample time (ms)
 * @property {number} p75     75th percentile sample time (ms)
 * @property {number} min     fastest sample (ms)
 * @property {number} mean    arithmetic mean (ms)
 * @property {number} samples number of samples
 * @property {number[]} times raw sample times (sorted ascending)
 */

/**
 * @param {number[]} times
 * @param {string} name
 * @returns {Stats}
 */
export function stats(times, name = '') {
  const sorted = times.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const q = (p) => {
    if (n === 0) return 0;
    const idx = (n - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  return {
    name,
    median: q(0.5),
    p75: q(0.75),
    min: sorted[0] ?? 0,
    mean: n ? sorted.reduce((a, b) => a + b, 0) / n : 0,
    samples: n,
    times: sorted,
  };
}

/**
 * @typedef {object} BenchOptions
 * @property {number} [warmup=5]   untimed warm-up iterations
 * @property {number} [samples=20] timed samples
 * @property {(() => any)} [setup]           runs (untimed) before every iteration, its result is
 *                                           passed to `fn` and `teardown`
 * @property {((ctx: any) => void)} [teardown] runs (untimed) after every iteration
 */

/**
 * @typedef {object} Variant
 * @property {(ctx: any) => void} fn
 * @property {(() => any)} [setup]
 * @property {((ctx: any) => void)} [teardown]
 */

/**
 * Creates a `() => ms` sampler for a variant that handles setup / teardown outside the timed
 * region.
 *
 * @param {Variant} variant
 */
function sampler(variant) {
  const { fn, setup, teardown } = variant;
  /** @param {boolean} collect run a full GC between setup and the timed region */
  return function sample(collect = false) {
    const ctx = setup ? setup() : undefined;
    // GC *after* setup so the young generation is empty when timing starts, regardless of how much
    // the setup allocated (otherwise a scavenge lands inside the timed region for some samples).
    if (collect) gc();
    const start = performance.now();
    fn(ctx);
    const elapsed = performance.now() - start;
    if (teardown) teardown(ctx);
    return elapsed;
  };
}

/**
 * Times `fn`.
 *
 * @param {string} name
 * @param {(ctx: any) => void} fn
 * @param {BenchOptions} [options]
 * @returns {Stats}
 */
export function bench(name, fn, options = {}) {
  const { warmup = 5, samples = 20, setup, teardown } = options;
  const sample = sampler({ fn, setup, teardown });

  for (let i = 0; i < warmup; i++) sample();

  const times = [];
  for (let i = 0; i < samples; i++) times.push(sample(true));

  return stats(times, name);
}

/**
 * Times several variants of the same benchmark, interleaving them sample by sample
 * (A, B, A, B, ...). The order in which variants run is reversed on every other sample so neither
 * variant systematically benefits from running first (e.g. directly after a GC).
 *
 * @template {Record<string, Variant | ((ctx: any) => void)>} V
 * @param {string} name
 * @param {V} variants e.g. `{ baseline: { fn, setup }, current: { fn, setup } }`
 * @param {{ warmup?: number, samples?: number }} [options]
 * @returns {{ [K in keyof V]: Stats }}
 */
export function benchInterleaved(name, variants, options = {}) {
  const { warmup = 5, samples = 20 } = options;

  const entries = Object.entries(variants).map(([label, variant]) => ({
    label,
    sample: sampler(typeof variant === 'function' ? { fn: variant } : variant),
    times: /** @type {number[]} */ ([]),
  }));

  // Interleaved warm-up.
  for (let i = 0; i < warmup; i++) {
    for (const entry of entries) entry.sample();
  }

  for (let i = 0; i < samples; i++) {
    const order = i % 2 === 0 ? entries : entries.slice().reverse();
    for (const entry of order) entry.times.push(entry.sample(true));
  }

  /** @type {any} */
  const result = {};
  for (const entry of entries) result[entry.label] = stats(entry.times, name);
  return result;
}

// ---------------------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------------------

/**
 * Formats a millisecond value with a precision that suits its magnitude.
 *
 * @param {number} ms
 */
export function fmtMs(ms) {
  if (!Number.isFinite(ms)) return '-';
  if (ms >= 100) return ms.toFixed(1);
  if (ms >= 10) return ms.toFixed(2);
  if (ms >= 1) return ms.toFixed(3);
  return ms.toFixed(4);
}

/**
 * Percentage change of `current` relative to `baseline`. Negative means current is faster.
 *
 * @param {number} current
 * @param {number} baseline
 */
export function delta(current, baseline) {
  if (!baseline) return 0;
  return ((current - baseline) / baseline) * 100;
}

/**
 * @param {number} pct
 * @returns {'improved' | 'regressed' | 'neutral'}
 */
export function classify(pct) {
  if (pct <= -NEUTRAL_THRESHOLD) return 'improved';
  if (pct >= NEUTRAL_THRESHOLD) return 'regressed';
  return 'neutral';
}

/**
 * @typedef {object} CompareRow
 * @property {string} name
 * @property {Stats} current
 * @property {Stats} [baseline]
 * @property {Record<string, string | number>} [extra] extra columns (see `options.columns`)
 */

/**
 * Prints a comparison table: `bench | current (ms) | baseline (ms) | Δ%` (+ any extra columns),
 * followed by a summary line. Returns the summary counts.
 *
 * @param {CompareRow[]} rows
 * @param {{ title?: string, columns?: string[], baselineRef?: string, rounds?: number, samples?: number }} [options]
 */
export function compare(rows, options = {}) {
  const { title, columns = [], baselineRef, rounds = 1, samples } = options;
  const hasBaseline = rows.some((row) => row.baseline);

  const head = [
    kleur.bold('bench'),
    kleur.bold('current (ms)'),
    kleur.bold(hasBaseline && baselineRef ? `baseline @ ${baselineRef} (ms)` : 'baseline (ms)'),
    kleur.bold('Δ%'),
    ...columns.map((c) => kleur.bold(c)),
  ];

  const table = new Table({
    head,
    colAligns: ['left', 'right', 'right', 'right', ...columns.map(() => 'right')],
    style: { head: [], border: ['grey'] },
  });

  let improved = 0,
    regressed = 0,
    neutral = 0;

  for (const row of rows) {
    const cur = fmtMs(row.current.median);
    let base = kleur.dim('-'),
      diff = kleur.dim('-');

    if (row.baseline) {
      const pct = delta(row.current.median, row.baseline.median);
      const label = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
      const kind = classify(pct);
      base = fmtMs(row.baseline.median);
      if (kind === 'improved') {
        improved++;
        diff = kleur.green(label);
      } else if (kind === 'regressed') {
        regressed++;
        diff = kleur.red(label);
      } else {
        neutral++;
        diff = kleur.dim(label);
      }
    }

    table.push([row.name, cur, base, diff, ...columns.map((c) => String(row.extra?.[c] ?? ''))]);
  }

  if (title) console.log(`\n${kleur.bold().underline(title)}`);
  console.log(table.toString());

  const how =
    `median of ${samples ?? 'N'} samples` +
    (rounds > 1 ? `, best of ${rounds} rounds (fresh module instances per round)` : '');

  if (hasBaseline) {
    console.log(
      `${kleur.green(`${improved} improved`)} / ${kleur.red(`${regressed} regressed`)} / ` +
        `${kleur.dim(`${neutral} neutral`)}  ` +
        kleur.dim(`(threshold ±${NEUTRAL_THRESHOLD}%, lower is better, ${how})`),
    );
  } else {
    console.log(kleur.dim('No baseline - run `node bench/build-baseline.js <ref>` to compare.'));
  }

  return { improved, regressed, neutral };
}

// ---------------------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------------------

/**
 * Parses the shared benchmark CLI flags.
 *
 * `--filter <substring>` only run benchmarks whose name includes the substring (case-insensitive,
 *                        may be repeated, comma separated).
 * `--quick`              smaller sizes / fewer samples.
 * `--calibrate`          A/A test: use an independent copy of `dist/prod` as the baseline to measure
 *                        the noise floor of the harness on this machine.
 * `--samples <n>`        override total sample count (split across rounds).
 * `--warmup <n>`         override warm-up count (per round).
 * `--rounds <n>`         number of rounds; each round re-imports both libraries as fresh module
 *                        instances (fresh JIT state) and the best round is reported per library.
 *
 * @param {string[]} [argv]
 */
export function parseArgs(argv = process.argv.slice(2)) {
  /** @type {{ filter: string[], quick: boolean, calibrate: boolean, samples?: number, warmup?: number, rounds?: number, help: boolean, rest: string[] }} */
  const args = { filter: [], quick: false, calibrate: false, help: false, rest: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--filter' || arg === '-f') {
      args.filter.push(
        ...String(argv[++i] ?? '')
          .split(',')
          .filter(Boolean),
      );
    } else if (arg.startsWith('--filter=')) {
      args.filter.push(...arg.slice('--filter='.length).split(',').filter(Boolean));
    } else if (arg === '--quick' || arg === '-q') {
      args.quick = true;
    } else if (arg === '--calibrate') {
      args.calibrate = true;
    } else if (arg === '--samples') {
      args.samples = Number(argv[++i]);
    } else if (arg.startsWith('--samples=')) {
      args.samples = Number(arg.slice('--samples='.length));
    } else if (arg === '--warmup') {
      args.warmup = Number(argv[++i]);
    } else if (arg.startsWith('--warmup=')) {
      args.warmup = Number(arg.slice('--warmup='.length));
    } else if (arg === '--rounds') {
      args.rounds = Math.max(1, Number(argv[++i]) || 1);
    } else if (arg.startsWith('--rounds=')) {
      args.rounds = Math.max(1, Number(arg.slice('--rounds='.length)) || 1);
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      args.rest.push(arg);
    }
  }

  return args;
}

/**
 * @param {string} name
 * @param {string[]} filters
 */
export function matchesFilter(name, filters) {
  if (!filters.length) return true;
  const lower = name.toLowerCase();
  return filters.some((f) => lower.includes(f.toLowerCase()));
}

/**
 * Prints a one-line progress note to stderr (so stdout stays clean for tables).
 *
 * @param {string} message
 */
export function progress(message) {
  process.stderr.write(kleur.dim(`  ${message}\n`));
}

/** Sink to defeat dead-code elimination. Assign results of benchmarked work to it. */
export const sink = { value: 0 };
