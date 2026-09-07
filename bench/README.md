# Benchmarks

Dependency-free benchmark suite that compares the **current** build of `@maverick-js/signals`
(`dist/prod/`) against a **baseline** build produced from any git ref (`bench/.baseline/`). Use it
to check whether a change to `src/` actually improves performance.

Everything here imports built ESM only (`dist/prod/*.js` and `bench/.baseline/index.js`), never
`src/`.

## Quick start

```sh
# 1. build the current library (whatever is in src/ right now)
./node_modules/.bin/rollup -c

# 2. build the baseline from a git ref (default: v6.0.0)
node bench/build-baseline.js            # v6.0.0
node bench/build-baseline.js main       # or a branch, tag, sha, HEAD~3, ...

# 3. run everything
node --expose-gc bench/index.js

# ...or a fast smoke run
node --expose-gc bench/index.js --quick
```

`--expose-gc` is optional: every suite re-executes itself with the flag when `globalThis.gc` is
missing so a full GC can run between samples.

## Files

| File                     | Purpose                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `index.js`               | Runs `synthetic`, `graph` and `dom` in sequence (each in its own process), forwarding flags. |
| `synthetic.js`           | Raw micro-benchmarks (create, re-run, fan-in/out, chains, diamonds, dispose, maps, ...).     |
| `graph.js`               | Reactively-style random dependency graphs (static + dynamic, push + pull).                   |
| `dom.js`                 | "Real work" scenarios (TodoMVC, data grid, nested components, form) against a fake DOM.      |
| `build-baseline.js`      | Bundles `src/` at a git ref into `bench/.baseline/index.js` (single file, esbuild).          |
| `layers.js`              | Cross-library layers benchmark (maverick vs S.js vs solid); unrelated to the baseline.       |
| `lib/harness.js`         | Timing, interleaving, stats, table output, seeded PRNG, CLI flag parsing.                    |
| `lib/load.js`            | Snapshots and loads `current` (`dist/prod`) and `baseline` (`bench/.baseline`).              |
| `lib/runner.js`          | Shared suite runner: rounds, interleaving, sanity-count checks, final table.                 |
| `lib/fake-dom.js`        | `FakeNode` + `syncChildren` with a global mutation counter.                                  |
| `.baseline/` (generated) | Baseline bundle + `REF` file (ref and commit sha). Git-ignored.                              |

## Running

```sh
node bench/index.js                      # all suites
node bench/index.js --quick              # smaller sizes, fewer samples (~1 min)
node bench/index.js --only synthetic,dom # subset of suites
node bench/synthetic.js                  # one suite
node bench/synthetic.js --filter dispose # only benchmarks whose name contains "dispose"
node bench/graph.js --filter "w1000,push"
node bench/dom.js --filter grid --samples 20
```

Flags (accepted by every suite and forwarded by `index.js`):

| Flag                | Meaning                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- |
| `--quick`           | Smaller sizes / fewer iterations and samples. Good for smoke tests, noisier.        |
| `--filter <substr>` | Only run benchmarks whose name contains the substring (case-insensitive, `,`-list). |
| `--calibrate`       | A/A test: baseline = an independent copy of `dist/prod` (see _Noise_ below).        |
| `--samples <n>`     | Override the total number of timed samples per benchmark (split across rounds).     |
| `--warmup <n>`      | Override the number of untimed warm-up iterations per round.                        |
| `--rounds <n>`      | Rounds with fresh module instances (default 3, or 2 with `--quick`). See _Noise_.   |
| `--only <suites>`   | (`index.js` only) comma separated subset of `synthetic,graph,dom`.                  |

Rebuilding: `dist/prod` is read at start-up, so re-run `rollup -c` after editing `src/` and then
re-run the benchmarks. The baseline never changes until you run `build-baseline.js` again.

## Reading the tables

```
┌───────────────────────────────┬──────────────┬─────────────────────────────┬────────┐
│ bench                         │ current (ms) │ baseline @ v6.0.0 (2c2a048) │     Δ% │
├───────────────────────────────┼──────────────┼─────────────────────────────┼────────┤
│ deep chain: 100 computeds ... │        11.37 │                       16.41 │ -30.7% │
└───────────────────────────────┴──────────────┴─────────────────────────────┴────────┘
1 improved / 0 regressed / 0 neutral  (threshold ±5%, lower is better, median of 6 samples, best of 3 rounds (fresh module instances per round))
```

- Times are the **median** of N samples, in milliseconds, taken from the **best of R rounds** (see
  _Noise_). **Lower is better.**
- `Δ%` is `(current - baseline) / baseline`. Negative = current is faster.
  - green: current is more than 5% faster
  - red: current is more than 5% slower
  - dim: within ±5% (treated as neutral / noise)
- `graph.js` also prints `computeds run` (total computed executions) and `dom.js` prints
  `mutations` (fake DOM operations). These are sanity checks: both libraries must report the same
  number, otherwise they are not doing equivalent work and the timings are not comparable. A red
  warning is printed when they differ (which can be legitimate if a change alters scheduling
  semantics, e.g. fewer redundant effect runs - but then you should know why).

Every benchmark runs both libraries in the same process, **interleaved sample by sample**
(baseline, current, baseline, current, ...), with the order flipped on every other sample and a GC
between samples. Setup and teardown (graph construction, disposal of previous state) are not timed
unless the benchmark is explicitly about creation or disposal.

Both builds are snapshotted into a temp directory when a suite starts, so rebuilding `dist/` while
a suite is running does not mix two versions of the code.

## Noise

Micro-benchmarks are noisy. Two effects dominate here:

- **GC pauses** landing inside a timed sample (allocation-heavy rows: creation, maps). Mitigated by
  a GC between samples and by taking the median.
- **JIT bimodality**: V8 sometimes settles one copy of the library into a persistently slower (or
  faster) optimised state for the whole process, and which copy gets lucky is random. In an A/A
  test this alone produced 30-50% "deltas" on some rows. Mitigated by **rounds**: every round
  re-imports both libraries as fresh module instances (fresh JIT feedback) and, per library, the
  round with the lowest median is reported. Slow states and GC only ever add time, so the best
  round is the fairest estimate for both sides.

Before trusting a delta:

1. Run `node bench/index.js --calibrate` (or with `--quick`). Both sides then run _identical_ code,
   so every delta is pure noise. On a quiet laptop, full-mode rows typically land within **±2-4%**,
   which is why the neutral threshold is ±5%. Sub-millisecond rows are much noisier; the suites
   repeat small operations inside a sample to keep samples above a few milliseconds.
2. Treat single rows near the ±5% boundary as inconclusive; re-run with more samples/rounds
   (`--samples 30 --rounds 5`) or look for a consistent direction across related rows (e.g. all
   `deep chain` sizes).
3. Close other heavy processes, keep the machine plugged in, and prefer full runs over `--quick`
   for decisions - `--quick` (fewer samples and rounds) exists for smoke testing and is noticeably
   noisier.
4. `--quick` and the full run use different sizes/iteration counts; only compare deltas within the
   same mode.

## Adding a benchmark

`synthetic.js`: call `define(name, { setup?, fn, teardown? })`. `setup(lib)` runs untimed before
every sample and its return value is passed to `fn(lib, ctx)` (timed) and `teardown(lib, ctx)`
(untimed). Use `definePhases` for multi-step scenarios where each step should be its own row. Write
results into `sink.value` so the JIT cannot eliminate the work. Use `rng(seed)` for anything random
so both libraries see the same sequence.

`dom.js`: add a scenario `{ name, reps, run(lib) }`. Everything in `run` is timed; create all
reactive state inside a `root` and dispose it at the end.

`graph.js`: add a config `{ name, config: { width, depth, nSources, dynamicFraction, readFraction },
iterations }`; both `pull` and `push` variants are generated automatically.