/**
 * Synthetic micro-benchmarks: `current` (dist/prod) vs `baseline` (bench/.baseline).
 *
 *   node bench/synthetic.js [--quick] [--filter <substring>[,<substring>]] [--calibrate]
 *                           [--samples n] [--warmup n]
 *
 * Every benchmark is run for both libraries in the same process, interleaved sample by sample, so
 * JIT / GC / CPU-frequency effects hit both roughly equally. Lower is better.
 *
 * Small operations are repeated (`reps`) inside each timed sample so that every sample takes at
 * least a few milliseconds - sub-millisecond samples are dominated by timer and scheduling noise.
 */

import { ensureExposeGC, parseArgs, rng, shuffle, sink } from './lib/harness.js';
import { runSuite } from './lib/runner.js';

if (ensureExposeGC()) process.exit();

const args = parseArgs();

if (args.help) {
  console.log(
    'node bench/synthetic.js [--quick] [--filter <substring>[,<substring>]] [--calibrate] [--samples n] [--warmup n] [--rounds n]',
  );
  process.exit(0);
}

const quick = args.quick;

/** Graph size: `--quick` shrinks the large (>= 10k) sizes by 5x. */
const N = (n) => (quick && n >= 10_000 ? Math.round(n / 5) : n);
/** Loop / repetition count: `--quick` halves it. */
const ITER = (n) => (quick ? Math.max(1, Math.ceil(n / 2)) : n);

const ROUNDS = args.rounds ?? (quick ? 2 : 3);
const SAMPLES = args.samples ?? (quick ? 8 : 18);
const WARMUP = args.warmup ?? (quick ? 2 : 3);
const NOOP = () => {};

/**
 * @typedef {import('./lib/load.js').Lib} Lib
 * @typedef {object} Benchmark
 * @property {string} name
 * @property {(lib: Lib) => any} [setup]           untimed, runs before every sample
 * @property {(lib: Lib, ctx: any) => void} fn     timed
 * @property {(lib: Lib, ctx: any) => void} [teardown] untimed, runs after every sample
 * @property {number} [samples]
 * @property {number} [warmup]
 */

/** @type {Benchmark[]} */
const benchmarks = [];

/** @param {string} name @param {Omit<Benchmark, 'name'>} def */
function define(name, def) {
  benchmarks.push({ name, ...def });
}

/**
 * Defines one benchmark row per phase. Phase `i` is timed after phases `0..i-1` have run (untimed)
 * on `reps` fresh contexts, so each row isolates a single step of a multi-step scenario.
 *
 * @param {string} prefix
 * @param {(lib: Lib) => any} init  must return a ctx with a `dispose()` function
 * @param {Array<{ name: string, run: (lib: Lib, ctx: any) => void }>} phases
 * @param {number} reps number of independent contexts advanced + timed per sample
 */
function definePhases(prefix, init, phases, reps) {
  phases.forEach((phase, index) => {
    define(`${prefix}: ${phase.name}`, {
      setup(lib) {
        const contexts = [];
        for (let r = 0; r < reps; r++) {
          const ctx = init(lib);
          for (let i = 0; i < index; i++) phases[i].run(lib, ctx);
          contexts.push(ctx);
        }
        return contexts;
      },
      fn(lib, contexts) {
        for (let r = 0; r < contexts.length; r++) phase.run(lib, contexts[r]);
      },
      teardown(_, contexts) {
        for (const ctx of contexts) ctx.dispose();
      },
    });
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
function withRoot(lib, init) {
  let dispose;
  const ctx = lib.root((d) => {
    dispose = d;
    return init();
  });
  return { ...ctx, dispose };
}

/** @param {number} n */
const range = (n) => Array.from({ length: n }, (_, i) => i);

// ---------------------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------------------

{
  const iters = ITER(2_000_000);
  define(`read: signal x${iters}`, {
    setup(lib) {
      return withRoot(lib, () => ({ s: lib.signal(1) }));
    },
    fn(_, { s }) {
      let total = 0;
      for (let i = 0; i < iters; i++) total += s();
      sink.value = total;
    },
    teardown: (_, ctx) => ctx.dispose(),
  });

  define(`write: signal without observers x${iters}`, {
    setup(lib) {
      return withRoot(lib, () => ({ s: lib.signal(0) }));
    },
    fn(_, { s }) {
      for (let i = 0; i < iters; i++) s.set(i);
      sink.value = s();
    },
    teardown: (_, ctx) => ctx.dispose(),
  });
}

{
  const iters = ITER(100_000);
  define(`effect: 1 signal -> 1 effect, set + tick x${iters}`, {
    setup(lib) {
      return withRoot(lib, () => {
        const s = lib.signal(0);
        lib.effect(() => {
          sink.value = s();
        });
        return { s };
      });
    },
    fn(lib, { s }) {
      for (let i = 0; i < iters; i++) {
        s.set(i);
        lib.tick();
      }
    },
    teardown: (_, ctx) => ctx.dispose(),
  });
}

{
  const iters = ITER(4_000);
  define(`batch: 100 signals -> 1 effect, set all + tick x${iters}`, {
    setup(lib) {
      return withRoot(lib, () => {
        const sources = range(100).map((i) => lib.signal(i));
        lib.effect(() => {
          let total = 0;
          for (let i = 0; i < sources.length; i++) total += sources[i]();
          sink.value = total;
        });
        return { sources };
      });
    },
    fn(lib, { sources }) {
      for (let i = 0; i < iters; i++) {
        for (let j = 0; j < sources.length; j++) sources[j].set(i + j);
        lib.tick();
      }
    },
    teardown: (_, ctx) => ctx.dispose(),
  });
}

// ---------------------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------------------

{
  // Creation is cheap, so the size is not reduced in quick mode - only the repetitions are.
  const n = 10_000;
  const reps = ITER(10);

  define(`create: ${n} signals x${reps}`, {
    fn(lib) {
      const { signal } = lib;
      let last;
      for (let r = 0; r < reps; r++) {
        for (let i = 0; i < n; i++) last = signal(i);
      }
      sink.value = last();
    },
  });

  define(`create: ${n} computeds (unread) x${reps}`, {
    fn(lib) {
      const { computed } = lib;
      let last;
      for (let r = 0; r < reps; r++) {
        for (let i = 0; i < n; i++) last = computed(() => i);
      }
      sink.value = typeof last;
    },
  });

  define(`create: ${n} signals + computeds (read once) in root, then dispose x${reps}`, {
    fn(lib) {
      const { root, signal, computed } = lib;
      for (let r = 0; r < reps; r++) {
        const dispose = root((dispose) => {
          for (let i = 0; i < n; i++) {
            const s = signal(i);
            sink.value = computed(() => s() + 1)();
          }
          return dispose;
        });
        dispose();
      }
    },
  });

  define(`create: ${n} effects (1 signal each) in root, then dispose x${reps}`, {
    fn(lib) {
      const { root, signal, effect } = lib;
      for (let r = 0; r < reps; r++) {
        const dispose = root((dispose) => {
          for (let i = 0; i < n; i++) {
            const s = signal(i);
            effect(() => {
              sink.value = s();
            });
          }
          return dispose;
        });
        dispose();
      }
    },
  });
}

// ---------------------------------------------------------------------------------------
// Re-computation
// ---------------------------------------------------------------------------------------

for (const K of [1, 5, 20]) {
  const iters = ITER(200_000);
  define(`static deps: computed with ${K} sources, set 1 + read x${iters}`, {
    setup(lib) {
      return withRoot(lib, () => {
        const sources = range(K).map((i) => lib.signal(i));
        const c = lib.computed(() => {
          let total = 0;
          for (let i = 0; i < K; i++) total += sources[i]();
          return total;
        });
        c();
        return { sources, c };
      });
    },
    fn(_, { sources, c }) {
      let total = 0;
      for (let i = 0; i < iters; i++) {
        sources[i % K].set(i);
        total += c();
      }
      sink.value = total;
    },
    teardown: (_, ctx) => ctx.dispose(),
  });
}

{
  const iters = ITER(100_000);
  define(`dynamic deps: computed switching between 2 sets of 10 sources, toggle + read x${iters}`, {
    setup(lib) {
      return withRoot(lib, () => {
        const toggle = lib.signal(false);
        const a = range(10).map((i) => lib.signal(i));
        const b = range(10).map((i) => lib.signal(i * 2));
        const c = lib.computed(() => {
          const set = toggle() ? a : b;
          let total = 0;
          for (let i = 0; i < set.length; i++) total += set[i]();
          return total;
        });
        c();
        return { toggle, c };
      });
    },
    fn(_, { toggle, c }) {
      let total = 0;
      for (let i = 0; i < iters; i++) {
        toggle.set((i & 1) === 1);
        total += c();
      }
      sink.value = total;
    },
    teardown: (_, ctx) => ctx.dispose(),
  });
}

for (const size of [1_000, 10_000]) {
  const n = N(size);
  const iters = ITER(Math.max(20, Math.round(400_000 / n)));
  define(`fan-out: 1 signal -> ${n} computeds -> 1 effect, set + tick x${iters}`, {
    setup(lib) {
      return withRoot(lib, () => {
        const s = lib.signal(0);
        const computeds = range(n).map((i) => lib.computed(() => s() + i));
        lib.effect(() => {
          let total = 0;
          for (let i = 0; i < computeds.length; i++) total += computeds[i]();
          sink.value = total;
        });
        return { s };
      });
    },
    fn(lib, { s }) {
      for (let i = 1; i <= iters; i++) {
        s.set(i);
        lib.tick();
      }
    },
    teardown: (_, ctx) => ctx.dispose(),
  });
}

{
  const n = 1_000;
  const iters = ITER(4_000);
  define(`fan-in: ${n} signals -> 1 computed, set random + read x${iters}`, {
    setup(lib) {
      return withRoot(lib, () => {
        const sources = range(n).map((i) => lib.signal(i));
        const c = lib.computed(() => {
          let total = 0;
          for (let i = 0; i < sources.length; i++) total += sources[i]();
          return total;
        });
        c();
        return { sources, c, rand: rng(42) };
      });
    },
    fn(_, { sources, c, rand }) {
      let total = 0;
      for (let i = 0; i < iters; i++) {
        sources[rand.int(sources.length)].set(i);
        total += c();
      }
      sink.value = total;
    },
    teardown: (_, ctx) => ctx.dispose(),
  });
}

for (const depth of [10, 100, 1_000]) {
  const iters = ITER(Math.round(400_000 / depth));
  define(`deep chain: ${depth} computeds, set root + read leaf x${iters}`, {
    setup(lib) {
      return withRoot(lib, () => {
        const s = lib.signal(0);
        let leaf = s;
        for (let i = 0; i < depth; i++) {
          const prev = leaf;
          leaf = lib.computed(() => prev() + 1);
        }
        leaf();
        return { s, leaf };
      });
    },
    fn(_, { s, leaf }) {
      let total = 0;
      for (let i = 0; i < iters; i++) {
        s.set(i);
        total += leaf();
      }
      sink.value = total;
    },
    teardown: (_, ctx) => ctx.dispose(),
  });
}

{
  const n = 1_000;
  const iters = ITER(100);
  define(`diamond: ${n} x (A -> B,C -> D -> effect), set all A + tick x${iters}`, {
    setup(lib) {
      return withRoot(lib, () => {
        const sources = range(n).map((i) => {
          const a = lib.signal(i);
          const b = lib.computed(() => a() + 1);
          const c = lib.computed(() => a() * 2);
          const d = lib.computed(() => b() + c());
          lib.effect(() => {
            sink.value = d();
          });
          return a;
        });
        return { sources };
      });
    },
    fn(lib, { sources }) {
      for (let i = 1; i <= iters; i++) {
        for (let j = 0; j < sources.length; j++) sources[j].set(i + j);
        lib.tick();
      }
    },
    teardown: (_, ctx) => ctx.dispose(),
  });
}

// ---------------------------------------------------------------------------------------
// Disposal
// ---------------------------------------------------------------------------------------

for (const size of [1_000, 10_000, 50_000]) {
  const n = N(size);
  // Dispose several roots per sample so small sizes still take a measurable amount of time.
  const reps = Math.max(1, Math.round(N(50_000) / n));
  define(`dispose children: root with ${n} child scopes, dispose root x${reps}`, {
    // The largest size is quadratic in older implementations - keep it affordable.
    samples: size >= 50_000 ? Math.min(SAMPLES, 3 * ROUNDS) : undefined,
    warmup: size >= 50_000 ? 1 : undefined,
    setup(lib) {
      const disposers = [];
      for (let r = 0; r < reps; r++) {
        disposers.push(
          lib.root((dispose) => {
            for (let i = 0; i < n; i++) lib.createScope();
            return dispose;
          }),
        );
      }
      return disposers;
    },
    fn(_, disposers) {
      for (let r = 0; r < disposers.length; r++) disposers[r]();
    },
  });
}

for (const size of [1_000, 10_000]) {
  const n = N(size);
  // ~20k effects disposed per sample regardless of size.
  const reps = Math.max(1, Math.round((2 * N(10_000)) / n));
  define(`dispose observers: ${n} effects on the same signal, dispose root x${reps}`, {
    setup(lib) {
      const disposers = [];
      for (let r = 0; r < reps; r++) {
        disposers.push(
          lib.root((dispose) => {
            const s = lib.signal(0);
            for (let i = 0; i < n; i++) {
              lib.effect(() => {
                sink.value = s();
              });
            }
            return dispose;
          }),
        );
      }
      return disposers;
    },
    fn(_, disposers) {
      for (let r = 0; r < disposers.length; r++) disposers[r]();
    },
  });
}

for (const order of ['creation order', 'reverse order']) {
  const n = 5_000;
  const reps = ITER(2);
  define(`effect stop churn: ${n} sibling effects, stop each in ${order} x${reps}`, {
    setup(lib) {
      const contexts = [];
      for (let r = 0; r < reps; r++) {
        contexts.push(
          lib.root((dispose) => {
            const stops = [];
            for (let i = 0; i < n; i++) {
              const s = lib.signal(i);
              stops.push(
                lib.effect(() => {
                  sink.value = s();
                }),
              );
            }
            return { stops, dispose };
          }),
        );
      }
      return contexts;
    },
    fn(_, contexts) {
      for (const { stops } of contexts) {
        if (order === 'creation order') {
          for (let i = 0; i < stops.length; i++) stops[i]();
        } else {
          for (let i = stops.length - 1; i >= 0; i--) stops[i]();
        }
      }
    },
    teardown(_, contexts) {
      for (const ctx of contexts) ctx.dispose();
    },
  });
}

{
  const iters = ITER(20_000);
  define(`onDispose churn: effect registering 5 onDispose callbacks, set + tick x${iters}`, {
    setup(lib) {
      return withRoot(lib, () => {
        const s = lib.signal(0);
        lib.effect(() => {
          sink.value = s();
          for (let i = 0; i < 5; i++) lib.onDispose(NOOP);
        });
        return { s };
      });
    },
    fn(lib, { s }) {
      for (let i = 1; i <= iters; i++) {
        s.set(i);
        lib.tick();
      }
    },
    teardown: (_, ctx) => ctx.dispose(),
  });
}

// ---------------------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------------------

{
  const n = 5_000;
  const reps = ITER(8);
  const values = (len, offset = 0) => range(len).map((i) => i + offset);

  definePhases(
    `computedMap (${n} items, x${reps})`,
    (lib) =>
      withRoot(lib, () => {
        const list = lib.signal(/** @type {number[]} */ ([]));
        const store = new Array(n * 2);
        const mapped = lib.computedMap(list, ($item, index) => {
          lib.effect(() => {
            store[index] = $item();
          });
          return index;
        });
        lib.effect(() => {
          sink.value = mapped().length;
        });
        return { list, mapped, store };
      }),
    [
      {
        name: `create ${n}`,
        run(lib, { list, mapped }) {
          list.set(values(n));
          lib.tick();
          sink.value = mapped().length;
        },
      },
      {
        name: 'update all values (same length)',
        run(lib, { list, mapped }) {
          list.set(values(n, 1));
          lib.tick();
          sink.value = mapped().length;
        },
      },
      {
        name: `grow ${n} -> ${2 * n}`,
        run(lib, { list, mapped }) {
          list.set(values(2 * n, 1));
          lib.tick();
          sink.value = mapped().length;
        },
      },
      {
        name: `shrink ${2 * n} -> ${n / 2}`,
        run(lib, { list, mapped }) {
          list.set(values(n / 2, 1));
          lib.tick();
          sink.value = mapped().length;
        },
      },
      {
        name: 'clear',
        run(lib, { list, mapped }) {
          list.set([]);
          lib.tick();
          sink.value = mapped().length;
        },
      },
    ],
    reps,
  );
}

{
  const n = 5_000;
  const reps = ITER(8);

  definePhases(
    `computedKeyedMap (${n} objects, x${reps})`,
    (lib) =>
      withRoot(lib, () => {
        const items = range(n).map((i) => ({ id: i, value: i * 2 }));
        const list = lib.signal(/** @type {typeof items} */ ([]));
        const store = new Array(n);
        const mapped = lib.computedKeyedMap(list, (item, $index) => {
          lib.effect(() => {
            store[$index()] = item.value;
          });
          return item.id;
        });
        lib.effect(() => {
          sink.value = mapped().length;
        });
        return { items, list, mapped, store, rand: rng(7) };
      }),
    [
      {
        name: `create ${n}`,
        run(lib, { list, items, mapped }) {
          list.set(items);
          lib.tick();
          sink.value = mapped().length;
        },
      },
      {
        name: 'swap first/last',
        run(lib, { list, mapped }) {
          const next = list().slice();
          const first = next[0];
          next[0] = next[next.length - 1];
          next[next.length - 1] = first;
          list.set(next);
          lib.tick();
          sink.value = mapped().length;
        },
      },
      {
        name: 'reverse',
        run(lib, { list, mapped }) {
          list.set(list().slice().reverse());
          lib.tick();
          sink.value = mapped().length;
        },
      },
      {
        name: 'remove every other item',
        run(lib, { list, mapped }) {
          list.set(list().filter((_, i) => i % 2 === 0));
          lib.tick();
          sink.value = mapped().length;
        },
      },
      {
        name: 'shuffle (seeded)',
        run(lib, { list, mapped, rand }) {
          list.set(shuffle(list().slice(), rand));
          lib.tick();
          sink.value = mapped().length;
        },
      },
      {
        name: 'clear',
        run(lib, { list, mapped }) {
          list.set([]);
          lib.tick();
          sink.value = mapped().length;
        },
      },
    ],
    reps,
  );
}

// ---------------------------------------------------------------------------------------
// Errors & context
// ---------------------------------------------------------------------------------------

{
  const iters = ITER(20_000);
  define(`error handling: throwing effect + onError on parent, set + tick x${iters}`, {
    setup(lib) {
      return withRoot(lib, () => {
        let handled = 0;
        lib.onError(() => {
          handled++;
          sink.value = handled;
        });
        const s = lib.signal(0);
        const error = new Error('boom');
        lib.effect(() => {
          s();
          throw error;
        });
        return { s };
      });
    },
    fn(lib, { s }) {
      for (let i = 1; i <= iters; i++) {
        s.set(i);
        lib.tick();
      }
    },
    teardown: (_, ctx) => ctx.dispose(),
  });
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
    define(
      `context: setContext at root, getContext(key, scope) from scope ${depth} deep x${iters}`,
      {
        setup: deepScope,
        fn(lib, { scope }) {
          let hits = 0;
          for (let i = 0; i < iters; i++) {
            if (lib.getContext('theme', scope) === 'dark') hits++;
          }
          sink.value = hits;
        },
        teardown: (_, ctx) => ctx.dispose(),
      },
    );
  }

  {
    const iters = ITER(200_000);
    define(`context: scoped(() => getContext(key), scope) from scope ${depth} deep x${iters}`, {
      setup: deepScope,
      fn(lib, { scope, read }) {
        let hits = 0;
        for (let i = 0; i < iters; i++) {
          if (lib.scoped(read, scope) === 'dark') hits++;
        }
        sink.value = hits;
      },
      teardown: (_, ctx) => ctx.dispose(),
    });
  }
}

// ---------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------

await runSuite({
  title: 'synthetic',
  args,
  rounds: ROUNDS,
  samples: SAMPLES,
  warmup: WARMUP,
  items: benchmarks.map((b) => ({
    name: b.name,
    samples: b.samples,
    warmup: b.warmup,
    make: (lib) => ({
      setup: b.setup ? () => b.setup(lib) : undefined,
      fn: (ctx) => b.fn(lib, ctx),
      teardown: b.teardown ? (ctx) => b.teardown(lib, ctx) : undefined,
    }),
  })),
});
