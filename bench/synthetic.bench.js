/**
 * Synthetic micro-benchmarks: `current` (dist/prod) vs `baseline` (bench/.baseline).
 *
 *   pnpm bench:synthetic            # or: vitest bench --run bench/synthetic
 *   BENCH_QUICK=1 pnpm bench:synthetic
 *
 * Small operations are repeated (`x<n>` in the name) inside every timed iteration so that each
 * iteration takes at least a few milliseconds - sub-millisecond iterations are dominated by timer
 * and scheduling noise.
 */

import { loadLibs } from './lib/load.js';
import * as random from './lib/rng.js';
import * as helpers from './lib/scenario.js';

// Local bindings: inside a vitest worker every access to an imported name goes through a module
// getter, which adds overhead to hot loops (see "Module runner overhead" in bench/README.md).
const { rng, shuffle } = random;
const { quick, range, scenario, sink, withRoot } = helpers;

const libs = loadLibs();

/** Graph size: quick mode shrinks the large (>= 10k) sizes by 5x. */
const N = (n) => (quick && n >= 10_000 ? Math.round(n / 5) : n);
/** Loop / repetition count: quick mode halves it. */
const ITER = (n) => (quick ? Math.max(1, Math.ceil(n / 2)) : n);
const NOOP = () => {};

/**
 * @typedef {import('./lib/load.js').Lib} Lib
 * @typedef {import('./lib/scenario.js').Variant} Variant
 */

/**
 * Defines a scenario whose state is created once (`setup`, untimed) and reused by every
 * iteration of `fn`; `ctx.dispose()` runs afterwards.
 *
 * @template T
 * @param {string} name
 * @param {(lib: Lib) => T & { dispose: () => void }} setup
 * @param {(lib: Lib, ctx: T) => void} fn
 */
function steady(name, setup, fn) {
  scenario(libs, name, (lib) => {
    let ctx;
    return {
      beforeAll: () => void (ctx = setup(lib)),
      fn: () => fn(lib, ctx),
      afterAll: () => ctx.dispose(),
    };
  });
}

// ---------------------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------------------

{
  const iters = ITER(2_000_000);

  steady(
    `read: signal x${iters}`,
    (lib) => withRoot(lib, () => ({ s: lib.signal(1) })),
    (_, { s }) => {
      let total = 0;
      for (let i = 0; i < iters; i++) total += s.get();
      sink.value = total;
    },
  );

  steady(
    `write: signal without observers x${iters}`,
    (lib) => withRoot(lib, () => ({ s: lib.signal(0) })),
    (_, { s }) => {
      for (let i = 0; i < iters; i++) s.set(i);
      sink.value = s.get();
    },
  );
}

{
  const iters = ITER(100_000);
  steady(
    `effect: 1 signal -> 1 effect, set + tick x${iters}`,
    (lib) =>
      withRoot(lib, () => {
        const s = lib.signal(0);
        lib.effect(() => {
          sink.value = s.get();
        });
        return { s };
      }),
    (lib, { s }) => {
      for (let i = 0; i < iters; i++) {
        s.set(i);
        lib.tick();
      }
    },
  );
}

{
  const iters = ITER(4_000);
  steady(
    `batch: 100 signals -> 1 effect, set all + tick x${iters}`,
    (lib) =>
      withRoot(lib, () => {
        const sources = range(100).map((i) => lib.signal(i));
        lib.effect(() => {
          let total = 0;
          for (let i = 0; i < sources.length; i++) total += sources[i].get();
          sink.value = total;
        });
        return { sources };
      }),
    (lib, { sources }) => {
      for (let i = 0; i < iters; i++) {
        for (let j = 0; j < sources.length; j++) sources[j].set(i + j);
        lib.tick();
      }
    },
  );
}

// ---------------------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------------------

{
  // Creation is cheap, so the size is not reduced in quick mode - only the repetitions are.
  const n = 10_000;
  const reps = ITER(10);

  scenario(libs, `create: ${n} signals x${reps}`, ({ signal }) => ({
    fn() {
      let last;
      for (let r = 0; r < reps; r++) {
        for (let i = 0; i < n; i++) last = signal(i);
      }
      sink.value = last.get();
    },
  }));

  scenario(libs, `create: ${n} computeds (unread) x${reps}`, ({ computed }) => ({
    fn() {
      let last;
      for (let r = 0; r < reps; r++) {
        for (let i = 0; i < n; i++) last = computed(() => i);
      }
      sink.value = typeof last;
    },
  }));

  scenario(
    libs,
    `create: ${n} signals + computeds (read once) in root, then dispose x${reps}`,
    ({ root, signal, computed }) => ({
      fn() {
        for (let r = 0; r < reps; r++) {
          const dispose = root((dispose) => {
            for (let i = 0; i < n; i++) {
              const s = signal(i);
              sink.value = computed(() => s.get() + 1).get();
            }
            return dispose;
          });
          dispose();
        }
      },
    }),
  );

  scenario(
    libs,
    `create: ${n} effects (1 signal each) in root, then dispose x${reps}`,
    ({ root, signal, effect }) => ({
      fn() {
        for (let r = 0; r < reps; r++) {
          const dispose = root((dispose) => {
            for (let i = 0; i < n; i++) {
              const s = signal(i);
              effect(() => {
                sink.value = s.get();
              });
            }
            return dispose;
          });
          dispose();
        }
      },
    }),
  );
}

// ---------------------------------------------------------------------------------------
// Re-computation
// ---------------------------------------------------------------------------------------

for (const K of [1, 5, 20]) {
  const iters = ITER(200_000);
  steady(
    `static deps: computed with ${K} sources, set 1 + read x${iters}`,
    (lib) =>
      withRoot(lib, () => {
        const sources = range(K).map((i) => lib.signal(i));
        const c = lib.computed(() => {
          let total = 0;
          for (let i = 0; i < K; i++) total += sources[i].get();
          return total;
        });
        c.get();
        return { sources, c };
      }),
    (_, { sources, c }) => {
      let total = 0;
      for (let i = 0; i < iters; i++) {
        sources[i % K].set(i);
        total += c.get();
      }
      sink.value = total;
    },
  );
}

{
  const iters = ITER(100_000);
  steady(
    `dynamic deps: computed switching between 2 sets of 10 sources, toggle + read x${iters}`,
    (lib) =>
      withRoot(lib, () => {
        const toggle = lib.signal(false);
        const a = range(10).map((i) => lib.signal(i));
        const b = range(10).map((i) => lib.signal(i * 2));
        const c = lib.computed(() => {
          const set = toggle.get() ? a : b;
          let total = 0;
          for (let i = 0; i < set.length; i++) total += set[i].get();
          return total;
        });
        c.get();
        return { toggle, c };
      }),
    (_, { toggle, c }) => {
      let total = 0;
      for (let i = 0; i < iters; i++) {
        toggle.set((i & 1) === 1);
        total += c.get();
      }
      sink.value = total;
    },
  );
}

{
  const iters = ITER(100_000);
  steady(
    `dynamic prefix: toggle then 20 stable sources (1 observer each), toggle + read x${iters}`,
    (lib) =>
      withRoot(lib, () => {
        const toggle = lib.signal(false);
        const a = lib.signal(1);
        const b = lib.signal(2);
        const stable = range(20).map((i) => lib.signal(i));
        const c = lib.computed(() => {
          let total = toggle.get() ? a.get() : b.get();
          for (let i = 0; i < stable.length; i++) total += stable[i].get();
          return total;
        });
        c.get();
        return { toggle, c };
      }),
    (_, { toggle, c }) => {
      let total = 0;
      for (let i = 0; i < iters; i++) {
        toggle.set((i & 1) === 1);
        total += c.get();
      }
      sink.value = total;
    },
  );
}

{
  const iters = ITER(2_000);
  const count = 200;
  steady(
    `dynamic prefix: ${count} computeds toggling, sharing 20 stable sources, toggle + read all x${iters}`,
    (lib) =>
      withRoot(lib, () => {
        const toggle = lib.signal(false);
        const a = lib.signal(1);
        const b = lib.signal(2);
        const stable = range(20).map((i) => lib.signal(i));
        const computeds = range(count).map((k) =>
          lib.computed(() => {
            let total = (toggle.get() ? a.get() : b.get()) + k;
            for (let i = 0; i < stable.length; i++) total += stable[i].get();
            return total;
          }),
        );
        for (const c of computeds) c.get();
        return { toggle, computeds };
      }),
    (_, { toggle, computeds }) => {
      let total = 0;
      for (let i = 0; i < iters; i++) {
        toggle.set((i & 1) === 1);
        for (let k = 0; k < computeds.length; k++) total += computeds[k].get();
      }
      sink.value = total;
    },
  );
}

for (const size of [1_000, 10_000]) {
  const n = N(size);
  const iters = ITER(Math.max(20, Math.round(400_000 / n)));
  steady(
    `fan-out: 1 signal -> ${n} computeds -> 1 effect, set + tick x${iters}`,
    (lib) =>
      withRoot(lib, () => {
        const s = lib.signal(0);
        const computeds = range(n).map((i) => lib.computed(() => s.get() + i));
        lib.effect(() => {
          let total = 0;
          for (let i = 0; i < computeds.length; i++) total += computeds[i].get();
          sink.value = total;
        });
        return { s };
      }),
    (lib, { s }) => {
      for (let i = 1; i <= iters; i++) {
        s.set(i);
        lib.tick();
      }
    },
  );
}

{
  const n = 1_000;
  const iters = ITER(4_000);
  steady(
    `fan-in: ${n} signals -> 1 computed, set random + read x${iters}`,
    (lib) =>
      withRoot(lib, () => {
        const sources = range(n).map((i) => lib.signal(i));
        const c = lib.computed(() => {
          let total = 0;
          for (let i = 0; i < sources.length; i++) total += sources[i].get();
          return total;
        });
        c.get();
        return { sources, c, rand: rng(42) };
      }),
    (_, { sources, c, rand }) => {
      let total = 0;
      for (let i = 0; i < iters; i++) {
        sources[rand.int(sources.length)].set(i);
        total += c.get();
      }
      sink.value = total;
    },
  );
}

for (const depth of [10, 100, 1_000]) {
  const iters = ITER(Math.round(400_000 / depth));
  steady(
    `deep chain: ${depth} computeds, set root + read leaf x${iters}`,
    (lib) =>
      withRoot(lib, () => {
        const s = lib.signal(0);
        let leaf = s;
        for (let i = 0; i < depth; i++) {
          const prev = leaf;
          leaf = lib.computed(() => prev.get() + 1);
        }
        leaf.get();
        return { s, leaf };
      }),
    (_, { s, leaf }) => {
      let total = 0;
      for (let i = 0; i < iters; i++) {
        s.set(i);
        total += leaf.get();
      }
      sink.value = total;
    },
  );
}

{
  const n = 1_000;
  const iters = ITER(100);
  steady(
    `diamond: ${n} x (A -> B,C -> D -> effect), set all A + tick x${iters}`,
    (lib) =>
      withRoot(lib, () => {
        const sources = range(n).map((i) => {
          const a = lib.signal(i);
          const b = lib.computed(() => a.get() + 1);
          const c = lib.computed(() => a.get() * 2);
          const d = lib.computed(() => b.get() + c.get());
          lib.effect(() => {
            sink.value = d.get();
          });
          return a;
        });
        return { sources };
      }),
    (lib, { sources }) => {
      for (let i = 1; i <= iters; i++) {
        for (let j = 0; j < sources.length; j++) sources[j].set(i + j);
        lib.tick();
      }
    },
  );
}

// ---------------------------------------------------------------------------------------
// Disposal (fresh state is built before EVERY iteration, untimed)
// ---------------------------------------------------------------------------------------

for (const size of [1_000, 10_000, 50_000]) {
  const n = N(size);
  // Dispose several roots per iteration so small sizes still take a measurable amount of time.
  const reps = Math.max(1, Math.round(N(50_000) / n));
  scenario(
    libs,
    `dispose children: root with ${n} child scopes, dispose root x${reps}`,
    (lib) => {
      let disposers;
      return {
        beforeEach() {
          disposers = range(reps).map(() =>
            lib.root((dispose) => {
              for (let i = 0; i < n; i++) lib.createScope();
              return dispose;
            }),
          );
        },
        fn() {
          for (let r = 0; r < disposers.length; r++) disposers[r]();
        },
      };
    },
    // The largest size is quadratic in older implementations - keep it affordable.
    size >= 50_000 ? { options: { iterations: 2, warmupIterations: 1 } } : undefined,
  );
}

for (const size of [1_000, 10_000]) {
  const n = N(size);
  // ~20k effects disposed per iteration regardless of size.
  const reps = Math.max(1, Math.round((2 * N(10_000)) / n));
  scenario(
    libs,
    `dispose observers: ${n} effects on the same signal, dispose root x${reps}`,
    (lib) => {
      let disposers;
      return {
        beforeEach() {
          disposers = range(reps).map(() =>
            lib.root((dispose) => {
              const s = lib.signal(0);
              for (let i = 0; i < n; i++) {
                lib.effect(() => {
                  sink.value = s.get();
                });
              }
              return dispose;
            }),
          );
        },
        fn() {
          for (let r = 0; r < disposers.length; r++) disposers[r]();
        },
      };
    },
  );
}

for (const order of ['creation order', 'reverse order']) {
  const n = 5_000;
  const reps = ITER(2);
  scenario(
    libs,
    `effect stop churn: ${n} sibling effects, stop each in ${order} x${reps}`,
    (lib) => {
      let contexts;
      return {
        beforeEach() {
          contexts = range(reps).map(() =>
            lib.root((dispose) => {
              const stops = [];
              for (let i = 0; i < n; i++) {
                const s = lib.signal(i);
                stops.push(
                  lib.effect(() => {
                    sink.value = s.get();
                  }),
                );
              }
              return { stops, dispose };
            }),
          );
        },
        fn() {
          for (const { stops } of contexts) {
            if (order === 'creation order') {
              for (let i = 0; i < stops.length; i++) stops[i]();
            } else {
              for (let i = stops.length - 1; i >= 0; i--) stops[i]();
            }
          }
        },
        afterEach() {
          for (const ctx of contexts) ctx.dispose();
        },
      };
    },
  );
}

{
  const iters = ITER(20_000);
  steady(
    `onDispose churn: effect registering 5 onDispose callbacks, set + tick x${iters}`,
    (lib) =>
      withRoot(lib, () => {
        const s = lib.signal(0);
        lib.effect(() => {
          sink.value = s.get();
          for (let i = 0; i < 5; i++) lib.onDispose(NOOP);
        });
        return { s };
      }),
    (lib, { s }) => {
      for (let i = 1; i <= iters; i++) {
        s.set(i);
        lib.tick();
      }
    },
  );
}

// ---------------------------------------------------------------------------------------
// Maps
//
// Every phase is self-contained: `beforeAll` builds `reps` maps in the phase's starting state,
// `fn` performs the phase on all of them (timed) and `afterEach` puts them back into the starting
// state (untimed) when the phase is not its own inverse.
// ---------------------------------------------------------------------------------------

/**
 * @template T
 * @param {string} name
 * @param {object} phase
 * @param {(lib: Lib) => T & { list: any, mapped: { get: () => unknown[] }, dispose: () => void }} phase.create
 *   builds one map (inside a root) with an empty list
 * @param {(ctx: T) => unknown[]} phase.initial list value every iteration starts from
 * @param {(lib: Lib, ctx: T) => void} phase.run  the timed step (set + tick + read)
 * @param {(ctx: T) => unknown[]} [phase.restore] list value to restore after every iteration
 * @param {boolean} [phase.rebuild] instead of `restore`, dispose the maps after every iteration and
 *   build fresh ones at `initial` (for phases whose inverse is far more expensive than the phase)
 * @param {number} reps
 * @param {Record<string, unknown>} [options]
 */
function mapPhase(name, { create, initial, run, restore, rebuild }, reps, options) {
  scenario(
    libs,
    name,
    (lib) => {
      let contexts;
      const setAll = (value) => {
        for (const ctx of contexts) {
          ctx.list.set(value(ctx));
          lib.tick();
          sink.value = ctx.mapped.get().length;
        }
      };
      const build = () => {
        contexts = range(reps).map(() => create(lib));
        setAll(initial);
      };
      const teardown = () => {
        for (const ctx of contexts) ctx.dispose();
      };
      return {
        beforeAll: build,
        fn() {
          for (const ctx of contexts) run(lib, ctx);
        },
        afterEach: rebuild
          ? () => (teardown(), build())
          : restore
            ? () => setAll(restore)
            : undefined,
        afterAll: teardown,
      };
    },
    { options },
  );
}

/** @param {Lib} lib @param {any} ctx @param {unknown[]} next */
function setList(lib, { list, mapped }, next) {
  list.set(next);
  lib.tick();
  sink.value = mapped.get().length;
}

{
  const n = 5_000;
  const reps = ITER(8);
  const prefix = `computedMap (${n} items, x${reps})`;
  const values = (len, offset = 0) => range(len).map((i) => i + offset);

  /** @param {Lib} lib */
  const create = (lib) =>
    withRoot(lib, () => {
      const list = lib.signal(/** @type {number[]} */ ([]));
      const store = new Array(n * 2);
      const mapped = lib.computedMap(list, ($item, index) => {
        lib.effect(() => {
          store[index] = $item.get();
        });
        return index;
      });
      lib.effect(() => {
        sink.value = mapped.get().length;
      });
      return { list, mapped, store, flip: false };
    });

  const empty = () => [];
  const full = values(n);
  const shifted = values(n, 1);
  const grown = values(2 * n, 1);
  const shrunk = values(n / 2, 1);

  mapPhase(
    `${prefix}: create ${n}`,
    { create, initial: empty, run: (lib, ctx) => setList(lib, ctx, full), restore: empty },
    reps,
  );

  mapPhase(
    `${prefix}: update all values (same length)`,
    {
      create,
      initial: () => full,
      run(lib, ctx) {
        ctx.flip = !ctx.flip;
        setList(lib, ctx, ctx.flip ? shifted : full);
      },
    },
    reps,
  );

  // Shrinking back is far slower than growing in older builds, so rebuild instead of restoring and
  // keep the number of (untimed but slow) rebuilds down with a shorter run.
  mapPhase(
    `${prefix}: grow ${n} -> ${2 * n}`,
    { create, initial: () => shifted, run: (lib, ctx) => setList(lib, ctx, grown), rebuild: true },
    reps,
    { time: 300 },
  );

  mapPhase(
    `${prefix}: shrink ${2 * n} -> ${n / 2}`,
    {
      create,
      initial: () => grown,
      run: (lib, ctx) => setList(lib, ctx, shrunk),
      restore: () => grown,
    },
    reps,
  );

  mapPhase(
    `${prefix}: clear`,
    {
      create,
      initial: () => shrunk,
      run: (lib, ctx) => setList(lib, ctx, []),
      restore: () => shrunk,
    },
    reps,
  );
}

{
  const n = 5_000;
  const reps = ITER(8);
  const prefix = `computedKeyedMap (${n} objects, x${reps})`;

  /** @param {Lib} lib */
  const create = (lib) =>
    withRoot(lib, () => {
      const items = range(n).map((i) => ({ id: i, value: i * 2 }));
      const list = lib.signal(/** @type {typeof items} */ ([]));
      const store = new Array(n);
      const mapped = lib.computedKeyedMap(list, (item, $index) => {
        lib.effect(() => {
          store[$index.get()] = item.value;
        });
        return item.id;
      });
      lib.effect(() => {
        sink.value = mapped.get().length;
      });
      return { items, list, mapped, store, rand: rng(7) };
    });

  const empty = () => [];
  const all = (ctx) => ctx.items;
  const everyOther = (ctx) => ctx.items.filter((_, i) => i % 2 === 0);

  mapPhase(
    `${prefix}: create ${n}`,
    { create, initial: empty, run: (lib, ctx) => setList(lib, ctx, ctx.items), restore: empty },
    reps,
  );

  mapPhase(
    `${prefix}: swap first/last`,
    {
      create,
      initial: all,
      run(lib, ctx) {
        const next = ctx.list.get().slice();
        const first = next[0];
        next[0] = next[next.length - 1];
        next[next.length - 1] = first;
        setList(lib, ctx, next);
      },
    },
    reps,
  );

  mapPhase(
    `${prefix}: reverse`,
    {
      create,
      initial: all,
      run: (lib, ctx) => setList(lib, ctx, ctx.list.get().slice().reverse()),
    },
    reps,
  );

  mapPhase(
    `${prefix}: remove every other item`,
    {
      create,
      initial: all,
      run: (lib, ctx) => setList(lib, ctx, everyOther(ctx)),
      restore: all,
    },
    reps,
  );

  mapPhase(
    `${prefix}: shuffle (seeded)`,
    {
      create,
      initial: all,
      run: (lib, ctx) => setList(lib, ctx, shuffle(ctx.list.get().slice(), ctx.rand)),
    },
    reps,
  );

  mapPhase(
    `${prefix}: clear`,
    {
      create,
      initial: everyOther,
      run: (lib, ctx) => setList(lib, ctx, []),
      restore: everyOther,
    },
    reps,
  );
}

// ---------------------------------------------------------------------------------------
// Errors & context
// ---------------------------------------------------------------------------------------

{
  const iters = ITER(20_000);
  steady(
    `error handling: throwing effect + onError on parent, set + tick x${iters}`,
    (lib) =>
      withRoot(lib, () => {
        let handled = 0;
        lib.onError(() => {
          handled++;
          sink.value = handled;
        });
        const s = lib.signal(0);
        const error = new Error('boom');
        lib.effect(() => {
          s.get();
          throw error;
        });
        return { s };
      }),
    (lib, { s }) => {
      for (let i = 1; i <= iters; i++) {
        s.set(i);
        lib.tick();
      }
    },
  );
}

{
  const depth = 50;

  /** @param {Lib} lib */
  function deepScope(lib) {
    return withRoot(lib, () => {
      lib.setContext('theme', 'dark');
      let scope = lib.getScope();
      for (let i = 0; i < depth; i++) {
        scope = lib.scoped(() => lib.createScope(), scope);
      }
      return { scope, read: () => lib.getContext('theme') };
    });
  }

  {
    // 100k reads is well under 1ms, so the loop is 10x longer than the nominal size.
    const iters = ITER(1_000_000);
    steady(
      `context: setContext at root, getContext(key, scope) from scope ${depth} deep x${iters}`,
      deepScope,
      (lib, { scope }) => {
        let hits = 0;
        for (let i = 0; i < iters; i++) {
          if (lib.getContext('theme', scope) === 'dark') hits++;
        }
        sink.value = hits;
      },
    );
  }

  {
    const iters = ITER(200_000);
    steady(
      `context: scoped(() => getContext(key), scope) from scope ${depth} deep x${iters}`,
      deepScope,
      (lib, { scope, read }) => {
        let hits = 0;
        for (let i = 0; i < iters; i++) {
          if (lib.scoped(read, scope) === 'dark') hits++;
        }
        sink.value = hits;
      },
    );
  }
}
