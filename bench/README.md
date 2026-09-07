# Benchmarks

Benchmark suite, run by [Vitest's benchmark runner](https://vitest.dev/guide/benchmarking), that
compares the **current** build of `@maverick-js/signals` (`dist/prod/`) against a **baseline**
build produced from any git ref (`bench/.baseline/`). Use it to check whether a change to `src/`
actually improves performance.

Everything here imports built ESM only (`dist/prod/*.js` and `bench/.baseline/index.js`), never
`src/`.

## Quick start

```sh
# 1. build the current library (whatever is in src/ right now)
pnpm build                        # or just: ./node_modules/.bin/rollup -c

# 2. build the baseline from a git ref (default: v6.0.0)
pnpm bench:baseline               # v6.0.0
pnpm bench:baseline main          # or a branch, tag, sha, HEAD~3, ...

# 3. run everything (~3-4 minutes)
pnpm bench

# ...or a fast smoke run (~1 minute, smaller sizes, noisier)
pnpm bench:quick
```

Rebuilding: `dist/prod` is read when a bench file starts, so re-run `pnpm build` after editing
`src/` and then re-run the benchmarks. The baseline never changes until you run `bench:baseline`
again. Without a baseline only `current` is measured.

## Files

| File                     | Purpose                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `synthetic.bench.js`     | Raw micro-benchmarks (create, re-run, fan-in/out, chains, diamonds, dispose, maps, ...).     |
| `graph.bench.js`         | Reactively-style random dependency graphs (static + dynamic, push + pull).                   |
| `dom.bench.js`           | "Real work" scenarios (TodoMVC, data grid, nested components, form) against a fake DOM.      |
| `build-baseline.js`      | Bundles `src/` at a git ref into `bench/.baseline/index.js` (single file, esbuild).          |
| `layers.js`              | Cross-library layers benchmark (maverick vs S.js vs solid); unrelated to the baseline.       |
| `lib/scenario.js`        | `scenario()`: one `test()` per scenario with one `bench()` per library; run options; `sink`. |
| `lib/load.js`            | Snapshots and loads `current` (`dist/prod`) and `baseline` (`bench/.baseline`).              |
| `lib/rng.js`             | Seeded PRNG + shuffle so every library sees the identical random sequence.                   |
| `lib/fake-dom.js`        | `FakeNode` + `syncChildren` with a global mutation counter.                                  |
| `.baseline/` (generated) | Baseline bundle + `REF` file (ref and commit sha). Git-ignored.                              |

Bench files are matched by `test.benchmark.include` in `vite.config.ts` (`bench/**/*.bench.js`);
`vitest run` (the regular test suite) skips them and `vitest bench` runs only them.

## Running

```sh
pnpm bench                       # all suites
pnpm bench:quick                 # BENCH_QUICK=1: smaller sizes, shorter runs (~1 min)
pnpm bench:calibrate             # BENCH_CALIBRATE=1: A/A noise test (see "Noise")
pnpm bench:synthetic             # one suite (also bench:graph, bench:dom)
pnpm bench synthetic             # same thing: vitest file filter
pnpm bench -t dispose            # only scenarios whose name matches the regexp
pnpm bench -t "w1000.*push"      # ...any vitest -t / --testNamePattern
BENCH_QUICK=1 pnpm bench dom -t Todo
```

Every `pnpm bench*` script is `vitest bench --run` (plus an environment variable), so all vitest
CLI flags work: `-t <regexp>` filters scenarios by name, positional arguments filter files,
`--reporter=verbose` prints every scenario on its own line, `--reporter=json --outputFile=...`
writes machine-readable results. Pass them directly after the script name - pnpm forwards a
literal `--` to vitest, which then ignores everything behind it (`pnpm bench -- -t dispose` runs
_all_ scenarios). If no tables show up (vitest picks a minimal reporter when it thinks it is
running under an agent or CI), add `--reporter=default`.

| Variable            | Meaning                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `BENCH_QUICK=1`     | Smaller sizes / fewer repetitions and much shorter runs. Smoke tests only. |
| `BENCH_CALIBRATE=1` | A/A test: `baseline` = an independent second copy of `dist/prod`.          |

`BENCH_QUICK` and the full run use different sizes/repetition counts; only compare numbers within
the same mode.

## Reading the output

Every scenario is a vitest `test()` that registers one `bench()` per library and runs them with
`bench.compare()`. The reporter prints one table per scenario:

```
 ✓ |bench| bench/dom.bench.js (4 tests) 2691ms
   ✓ TodoMVC (300 todos) 648ms
     name          hz     min     max    mean     p75     p99    p995    p999     rme  samples
     current   199.47  4.3247  8.5824  5.1243  5.2078  8.4697  8.5260  8.5711  ±4.98%       49   fastest
     baseline  161.39  5.0145  7.9334  6.3330  7.1416  7.8602  7.8968  7.9261  ±4.76%       40
```

- `hz` - iterations per second. **Higher is better.** One iteration is one call of the scenario's
  function, i.e. everything after `x<n>` in the name (`x2000000` = two million reads per iteration).
- `min` / `max` / `mean` - iteration time in milliseconds. **Lower is better.** `mean` is the number
  that ranks the rows.
- `p75` / `p99` / `p995` / `p999` - percentiles of the iteration time. A `p99` far above `mean`
  means GC pauses or scheduling hiccups landed inside a few iterations; compare `p75` if so.
- `rme` - relative margin of error of the mean (95% confidence). Two rows whose `rme` ranges
  overlap are not distinguishable in that run.
- `samples` - number of timed iterations. Each library runs for at least `time` ms (1000 in full
  mode, 250 in quick mode) and at least `iterations` iterations, after a short warm-up.
- `fastest` marks the row with the lowest `mean`. The current-vs-baseline ratio is
  `current.hz / baseline.hz` (or `baseline.mean / current.mean`): 1.35 above means `current` is
  1.35x faster; below 1 means it is that many times slower. `slowest` is only printed with three or
  more rows.

Setup and teardown (graph construction, disposal of previous state, restoring a map to its
starting length) run in tinybench hooks (`beforeAll` / `beforeEach` / `afterEach` / `afterAll`)
and are **never timed** - unless the scenario is explicitly about creation or disposal, in which
case the untimed hook builds the state and the timed function creates/disposes it.

### Sanity checks

`graph.bench.js` and `dom.bench.js` run every scenario once per library before benchmarking it
and **assert** that the work done is identical: the number of computed executions (graph) and the
number of fake-DOM mutations (dom) must match between `current` and `baseline`. A mismatch fails
the test with both numbers - the two builds are not doing equivalent work, so their timings would
not be comparable. This can be legitimate when a change alters scheduling semantics (e.g. fewer
redundant effect runs) but then you should know why, and adjust the scenario (or accept the
difference) deliberately.

## Noise

Micro-benchmarks are noisy. Things to keep in mind:

- **Tasks run one after another**, not interleaved: within a scenario `current` runs its warm-up
  and timed iterations, then `baseline` does. CPU frequency drift, thermal throttling and JIT
  state can therefore differ between the two rows. In an A/A test on a quiet laptop rows above
  ~10ms per iteration typically agree within **±2-4%**, while sub-10ms rows drift by up to
  **~10%** between runs. Treat differences of that size as noise.
- **GC pauses** land inside some iterations of allocation-heavy rows (creation, maps, DOM
  scenarios). They show up as a large `p99`/`max`; the `mean` is still the number to compare, but
  look at `p75` when `rme` is high.
- **Cross-process drift**: two separate `pnpm bench` runs of the very same code can disagree by
  several percent. Do not compare numbers across runs by eye; compare `current` against
  `baseline` within one run.

Before trusting a difference:

1. Run `pnpm bench:calibrate` (or `BENCH_CALIBRATE=1 pnpm bench:quick`). Both sides then run
   _identical_ code, so every difference is pure noise - that is your noise floor for the rows
   you care about on this machine.
2. For small changes, **build the previous commit as the baseline** (`pnpm bench:baseline HEAD~1`
   or the sha before your change) rather than an old release: the smaller the real difference,
   the less unrelated churn you want in the comparison.
3. Treat single rows near the noise floor as inconclusive; re-run, or look for a consistent
   direction across related rows (e.g. all `deep chain` sizes, or all `[push]` graphs).
4. Close other heavy processes, keep the machine plugged in, and prefer full runs over
   `BENCH_QUICK` for decisions - quick mode exists for smoke testing and is noticeably noisier.

### Module runner overhead

Inside a vitest worker, modules are loaded through vite's module runner, which turns every
imported binding into a getter (`__vite_ssr_import_0__.name`). The bench files avoid this in two
ways, and vitest prints a `Benchmark Warning ... accessed module export getters too many times`
if a new scenario reintroduces it:

- `lib/load.js` loads `dist/prod` and `bench/.baseline` with Node's native `require(esm)` instead
  of `import()`, so the library code under test is exactly the built output. This matters: the
  transformed multi-file `dist/prod` build would pay getter overhead on every internal call while
  the single-file baseline bundle would not.
- Helpers used in hot loops (`sink`, `rng`, `FakeNode`, ...) are imported as a namespace and bound
  to local constants once at the top of each bench file.

Both builds are snapshotted into a temp directory when a bench file starts, so rebuilding `dist/`
while a suite is running does not mix two versions of the code.

## Long-lived baselines (`writeResult` / `bench.from`)

`bench/.baseline` is rebuilt from source every time, which is the most faithful comparison (same
machine, same process, same run). If you want to keep a **recorded** result around instead - e.g.
to compare against numbers from a release without rebuilding it - vitest can persist and reload
results:

```js
// record: writes the result of `current` to a JSON file after a successful run
bench('current', { writeResult: './bench/results/deep-chain-1000.json' }, fn);

// later: load the recorded result and compare against it without running anything
const result = await bench.compare(
  bench('current', fn),
  bench.from('v6.0.0', './bench/results/deep-chain-1000.json'),
);
```

Paths are relative to the project root and must stay inside it. Recorded numbers are only
comparable on the same machine and Node version; for anything else, build a real baseline.

## Adding a benchmark

All scenarios go through `scenario(libs, name, make, extra?)` from `lib/scenario.js`:

- `make(lib)` returns `{ fn, beforeAll?, beforeEach?, afterEach?, afterAll? }`. `fn` is timed; the
  hooks are not. Keep state in closure variables - `scenario()` calls `make` once per library, so
  nothing is shared between `current` and `baseline`.
- `extra.check(lib)` (optional) runs once per library before benchmarking and must return a
  number that is asserted equal across libraries (`extra.checkLabel` names it).
- `extra.options` overrides the tinybench run options (`time`, `iterations`, `warmupTime`,
  `warmupIterations`) for one scenario.

Write results into `sink.value` so the JIT cannot eliminate the work, use `rng(seed)` for anything
random, repeat small operations inside `fn` so an iteration takes at least a few milliseconds,
and put the repetition count in the name (`x${iters}`). Honour `quick` for large sizes.

`synthetic.bench.js` has two shortcuts: `steady(name, setup, fn)` for scenarios whose state is
built once and reused by every iteration, and `mapPhase(...)` for the map phases, where `afterEach`
restores the starting list length so each phase (create / update / grow / shrink / clear) stays
independent. `dom.bench.js`: add `{ name, reps, run(lib) }` to `scenarios`; everything in `run` is
timed, so create all reactive state inside a `root` and dispose it at the end. `graph.bench.js`:
add `{ name, config: { width, depth, nSources, dynamicFraction, readFraction }, iterations }` to
`configs`; both `pull` and `push` variants are generated automatically.