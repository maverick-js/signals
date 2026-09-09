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

| File                     | Purpose                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `synthetic.bench.js`     | Raw micro-benchmarks (create, re-run, fan-in/out, chains, diamonds, dispose, maps, ...). |
| `graph.bench.js`         | Reactively-style random dependency graphs (static + dynamic, push + pull).               |
| `dom.bench.js`           | "Real work" UI scenarios against a fake DOM (list below).                                |
| `build-baseline.js`      | Bundles `src/` at a git ref into `bench/.baseline/index.js` (single file, esbuild).      |
| `lib/scenario.js`        | `scenario()`: one `describe()` per scenario with one `bench()` per library; run options. |
| `lib/load.js`            | Snapshots/loads `current` + `baseline`; adapts a legacy (callable) baseline to `.get()`. |
| `lib/rng.js`             | Seeded PRNG + shuffle so every library sees the identical random sequence.               |
| `lib/fake-dom.js`        | `FakeNode` + `syncChildren` (keyed reconciliation) with a global mutation counter.       |
| `.baseline/` (generated) | Baseline bundle + `REF` file (ref and commit sha). Git-ignored.                          |

Bench files are matched by `test.benchmark.include` in `vite.config.ts` (`bench/**/*.bench.js`);
`vp test` (the regular test suite) skips them and `vp test bench` runs only them.

### `dom.bench.js` scenarios

Whole-app scenarios (creation, interaction and disposal are all timed):

- **TodoMVC** - `computedKeyedMap` over a filtered list: add, toggle, edit, filter, remove, clear.
- **data grid** - the same rows rendered through `computedMap` _and_ `computedKeyedMap`, with a
  `selector` for the selected row: cell updates, sort, select, page, scroll.
- **nested components** - a tree of `root`s (depth 6, branching 3) reading context, with leaf
  updates and one subtree re-render.
- **form** - 50 fields with validation computeds, keystrokes and submit toggles.

Stateful scenarios (the state is built untimed in `beforeAll`, one operation is timed, and the
state is restored untimed after every iteration where the operation is not its own inverse):

- **js-framework-benchmark** - the [Krausest](https://github.com/krausest/js-framework-benchmark)
  operations on a `computedKeyedMap` of `{ id, label: signal }` rows rendered to `<tr>`s (label
  cell bound by an effect, selected class via `selector`), one row per operation: create 1,000
  rows, replace all 1,000, partial update (every 10th label, x50), select row (x500), swap rows 1
  and 998 (x10), remove one row (x10), create 10,000 rows (2,500 in quick mode), append 1,000 rows
  to 1,000, clear 1,000 rows.
- **media player** - a Vidstack-shaped player: `currentTime` written 60 times per second of
  playback fanning out to ~20 computeds (formatted times, progress / buffered percentages, chapter,
  volume level, ...) and 15 effects writing attributes and text, with `paused`, `volume`, `muted`,
  `playbackRate` and `duration` touched occasionally; 10 seconds per iteration (5 in quick mode).
- **component churn** - route changes: mount 100 component `root`s under an app scope (3 signals,
  2 computeds, 3 effects and a `getContext` read each; every other one renders a
  `computedKeyedMap` of 10 children) and dispose them all again; x4 per iteration (x2 in quick
  mode). Disposal is part of the timed work.

## Running

### Cross-library comparison

`pnpm bench:compare` runs `bench/compare.js`: this library against alien-signals,
@preact/signals-core, Solid 1.x (vendored core), @solidjs/signals 2.x and the TC39 signal-polyfill.
It measures nine graph shapes (`bench/lib/scenarios.js`), disposal cost at 1k/10k/50k nodes with the
previous release from `bench/.baseline` as an extra row (build it first with
`pnpm bench:baseline v6.0.0`), tree-shaken bundle size, and bytes retained per signal/computed/effect
(`bench/lib/memory-probe.js`, one fresh `--expose-gc` process per library and kind so nothing else is
on the heap). Everything renders as text bar charts. With `--update-readme` (what the script does) it
rewrites the section between `<!-- bench:start -->` and `<!-- bench:end -->` in the root README:
three headline panels and the scaling table up front, the nine panels in a collapsed block, then
size and memory. Regenerate per release with `pnpm build && pnpm bench:baseline <previous tag> &&
pnpm bench:compare`. `pnpm bench:compare:quick` prints a fast smoke run without touching the README.

### In real browsers

`pnpm bench:browser` (`bench/browser.js`) bundles the six libraries, the adapters and the nine
scenarios into a single page and runs it headless in Chromium, WebKit and Firefox through
Playwright (`pnpm exec playwright install chromium webkit firefox` once), printing one chart block
per engine. Browsers coarsen `performance.now()` to 100µs (Chromium) or 1ms (WebKit, Firefox), so
every sample repeats the operation until at least 20ms have elapsed and reports the per-call time;
the Node harness uses the same rule. `--quick` and `--browsers chromium,webkit` narrow a run. The
"Browser benchmarks" workflow runs it weekly and on demand and posts the charts to the job summary;
it never gates a merge. With `--update-readme` the run also rewrites the per-engine table between
`<!-- bench-browser:start -->` and `<!-- bench-browser:end -->` in the root README (how many times
slower alien-signals and Preact are than this library in each engine); the weekly workflow commits
that table when it changes.

### Memory

Leak coverage lives in `tests/memory/` (`pnpm test:memory`), not in the benchmarks: WeakRef and
FinalizationRegistry checks that every node created inside a root is collectable after dispose,
that effect re-runs release the previous generation of nested computations, that map items removed
across grow/shrink cycles are released and the map scope stays compact, plus a heap soak that runs a
TodoMVC-shaped app through 200 mount/update/unmount cycles and asserts the heap does not grow.

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

## Long-lived baselines (`--outputJson` / `--compare`)

`bench/.baseline` is rebuilt from source every time, which is the most faithful comparison (same
machine, same process, same run). If you want to keep a **recorded** run around instead - e.g. to
compare against numbers from a release without rebuilding it - vitest can persist and reload
results:

```sh
pnpm bench --outputJson bench/results/v6.0.0.json   # record this run
pnpm bench --compare bench/results/v6.0.0.json      # later: print the delta against the record
```

Recorded numbers are only comparable on the same machine and Node version; for anything else,
build a real baseline.

## Adding a benchmark

All scenarios go through `scenario(libs, name, make, extra?)` from `lib/scenario.js`:

- `make(lib)` returns `{ fn, beforeAll?, beforeEach?, afterEach?, afterAll? }`. `fn` is timed; the
  hooks are not (`beforeAll`/`afterAll` map to tinybench's `setup`/`teardown`; the per-iteration
  hooks are attached to the tinybench task from `setup`, since vitest only forwards the
  bench-level hooks). Keep state in closure variables - `scenario()` calls `make` once per library, so
  nothing is shared between `current` and `baseline`.
- `extra.check(lib)` (optional) runs once per library before benchmarking and must return a
  number that is asserted equal across libraries (`extra.checkLabel` names it).
- `extra.options` overrides the tinybench run options (`time`, `iterations`, `warmupTime`,
  `warmupIterations`) for one scenario.

Write results into `sink.value` so the JIT cannot eliminate the work, use `rng(seed)` for anything
random, repeat small operations inside `fn` so an iteration takes at least a few milliseconds,
and put the repetition count in the name (`x${iters}`). Honour `quick` for large sizes.

Scenarios use the object API only: `s.get()` / `c.get()` to read, `s.set(v)` to write, `s.peek()`
to read untracked, `computedMap(list, (item, i) => item.get())`,
`computedKeyedMap(list, (item, $index) => $index.get())` and `selector(source)(key).get()`.
Never call a signal or computed as a function. A baseline built from a ref that still has the
callable API (v6.0.0 and earlier: `s()` reads) is wrapped by `lib/load.js` so it presents the same
`.get()` surface; `get` is the legacy read function itself, so reads are not slowed down, but one
small wrapper object is allocated per node, which makes the baseline's _creation_ rows slightly
pessimistic.

`synthetic.bench.js` has two shortcuts: `steady(name, setup, fn)` for scenarios whose state is
built once and reused by every iteration, and `mapPhase(...)` for the map phases, where `afterEach`
restores the starting list length so each phase (create / update / grow / shrink / clear) stays
independent. `dom.bench.js`: add `{ name, reps, run(lib) }` to `scenarios` for a whole-app
scenario (everything in `run` is timed, so create all reactive state inside a `root` and dispose
it at the end), or use `stateful(name, { create, run, restore? })` when the state should be built
once and only one operation timed (`create` runs in `beforeAll`, `restore` in `afterEach`, and
`ctx.dispose()` in `afterAll`; `check` counts the mutations of a single `run` against fresh state).
`create` must return an object with a `dispose()` (build it with `withRoot()`). `graph.bench.js`:
add `{ name, config: { width, depth, nSources, dynamicFraction, readFraction }, iterations }` to
`configs`; both `pull` and `push` variants are generated automatically.