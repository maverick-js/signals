/**
 * The nine comparison scenarios and the timing loop. Environment-agnostic (Node or browser); only
 * `performance.now()` is required, `globalThis.gc` is used when present.
 */

const sink = { value: 0 };
const range = (n) => Array.from({ length: n }, (_, i) => i);

/**
 * @param {{ quick?: boolean }} options quick: sizes and repetition counts divided by 4
 * @returns {Record<string, (L: any) => () => void>} scenario name -> factory returning the timed function
 *   (setup outside the returned function is untimed)
 */
export function createScenarios({ quick = false } = {}) {
  const N = (n) => (quick ? Math.max(1, Math.round(n / 4)) : n);
  const k = (n) => `${n / 1000}k`;

  return {
    [`Create ${k(N(10_000))} signals + computeds`]: (L) => () => {
      const dispose = L.root(() => {
        for (let i = 0; i < N(10_000); i++) {
          const s = L.signal(i);
          const c = L.computed(() => s.get() + 1);
          sink.value = c();
        }
      });
      dispose();
    },
    [`Create ${k(N(10_000))} effects, then dispose`]: (L) => () => {
      const dispose = L.root(() => {
        for (let i = 0; i < N(10_000); i++) {
          const s = L.signal(i);
          L.effect(() => {
            sink.value = s.get();
          });
        }
      });
      dispose();
    },
    [`Static deps: 5 sources, set + read ×${k(N(200_000))}`]: (L) => {
      const s = range(5).map((i) => L.signal(i));
      const c = L.computed(() => s[0].get() + s[1].get() + s[2].get() + s[3].get() + s[4].get());
      c();
      return () => {
        for (let i = 0; i < N(200_000); i++) {
          s[i % 5].set(i);
          sink.value = c();
        }
      };
    },
    [`Dynamic deps: toggle 2 sets of 10 ×${k(N(100_000))}`]: (L) => {
      const toggle = L.signal(false);
      const a = range(10).map((i) => L.signal(i));
      const b = range(10).map((i) => L.signal(i * 2));
      const c = L.computed(() => {
        const set = toggle.get() ? a : b;
        let total = 0;
        for (let i = 0; i < 10; i++) total += set[i].get();
        return total;
      });
      c();
      return () => {
        for (let i = 0; i < N(100_000); i++) {
          toggle.set((i & 1) === 1);
          sink.value = c();
        }
      };
    },
    [`Deep chain: 1000 computeds ×${N(200)}`]: (L) => {
      const s = L.signal(0);
      let prev = () => s.get();
      for (let i = 0; i < 1000; i++) {
        const p = prev;
        prev = L.computed(() => p() + 1);
      }
      prev();
      return () => {
        for (let i = 0; i < N(200); i++) {
          s.set(i);
          sink.value = prev();
        }
      };
    },
    [`Fan-out: 1 → 1000 computeds → effect ×${N(400)}`]: (L) => {
      const s = L.signal(0);
      const cs = range(1000).map((i) => L.computed(() => s.get() * i));
      L.root(() => {
        L.effect(() => {
          let total = 0;
          for (let i = 0; i < 1000; i++) total += cs[i]();
          sink.value = total;
        });
      });
      return () => {
        for (let i = 0; i < N(400); i++) L.batch(() => s.set(i));
      };
    },
    [`Diamond ×1000 with effects ×${N(100)}`]: (L) => {
      const as = range(1000).map((i) => L.signal(i));
      L.root(() => {
        for (let i = 0; i < 1000; i++) {
          const a = as[i],
            b = L.computed(() => a.get() + 1),
            c = L.computed(() => a.get() * 2),
            d = L.computed(() => b() + c());
          L.effect(() => {
            sink.value = d();
          });
        }
      });
      return () => {
        for (let r = 0; r < N(100); r++) {
          L.batch(() => {
            for (let i = 0; i < 1000; i++) as[i].set(r + i);
          });
        }
      };
    },
    [`Batch: 100 signals → 1 effect ×${k(N(4000))}`]: (L) => {
      const s = range(100).map((i) => L.signal(i));
      L.root(() => {
        L.effect(() => {
          let total = 0;
          for (let i = 0; i < 100; i++) total += s[i].get();
          sink.value = total;
        });
      });
      return () => {
        for (let r = 0; r < N(4000); r++) {
          L.batch(() => {
            for (let i = 0; i < 100; i++) s[i].set(r + i);
          });
        }
      };
    },
    [`Dispose ${k(N(10_000))} effects on one signal`]: (L) => () => {
      const s = L.signal(0);
      const dispose = L.root(() => {
        for (let i = 0; i < N(10_000); i++) {
          L.effect(() => {
            sink.value = s.get();
          });
        }
      });
      dispose();
    },
  };
}

const median = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];

/**
 * Runs every scenario for every library. Libraries are interleaved within a round so drift affects
 * them equally; the result per cell is the best round's median of per-call times.
 *
 * Browsers coarsen `performance.now()` (100µs in Chromium, 1ms in WebKit and Firefox), so a sample
 * repeats the timed function until at least `minSampleMs` have elapsed and reports the average per
 * call. Scenarios that already take longer than that run once per sample, as before.
 *
 * @param {Record<string, any>} libs
 * @param {Record<string, (L: any) => () => void>} scenarios
 * @param {{ quick?: boolean, minSampleMs?: number, log?: (line: string) => void }} [options]
 * @returns {Promise<Record<string, Record<string, number>>>} scenario -> library -> ms per call
 */
export async function runPerformance(
  libs,
  scenarios,
  { quick = false, minSampleMs = 20, log } = {},
) {
  const rounds = quick ? 2 : 3,
    samples = quick ? 3 : 5,
    warmup = quick ? 1 : 2;
  const results = {};
  for (const [name, make] of Object.entries(scenarios)) {
    results[name] = {};
    log?.(name);
    for (let round = 0; round < rounds; round++) {
      for (const [lib, L] of Object.entries(libs)) {
        const fn = make(L);
        for (let i = 0; i < warmup; i++) fn();
        const times = [];
        for (let i = 0; i < samples; i++) times.push(sample(fn, minSampleMs));
        results[name][lib] = Math.min(results[name][lib] ?? Infinity, median(times));
        // Let the engine settle between libraries (GC, timers) without blocking the page.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }
  return results;
}

/** Times one sample: repeats `fn` until `minSampleMs` have elapsed and returns the ms per call. */
export function sample(fn, minSampleMs = 20) {
  globalThis.gc?.();
  let calls = 0,
    elapsed;
  const start = performance.now();
  do {
    fn();
    calls++;
    elapsed = performance.now() - start;
  } while (elapsed < minSampleMs);
  return elapsed / calls;
}

/**
 * Disposal cost as the graph grows. Each factory takes the library adapter and `n` and returns the
 * timed function; the table these feed shows whether cost grows linearly or quadratically.
 */
export function createScalingScenarios() {
  return {
    'Dispose N effects on one signal': (L, n) => () => {
      const s = L.signal(0);
      const dispose = L.root(() => {
        for (let i = 0; i < n; i++) {
          L.effect(() => {
            sink.value = s.get();
          });
        }
      });
      dispose();
    },
    'Dispose a root with N computeds (each read once)': (L, n) => () => {
      const s = L.signal(0);
      const dispose = L.root(() => {
        for (let i = 0; i < n; i++) {
          const c = L.computed(() => s.get() + i);
          sink.value = c();
        }
      });
      dispose();
    },
  };
}

/**
 * Runs the scaling scenarios at each size. A library that already takes longer than `maxMs` at one
 * size is not run at the larger ones (its cell is `null`), so a quadratic implementation can't stall
 * the whole run.
 *
 * @returns {Promise<Record<string, Record<string, Record<number, number | null>>>>} scenario -> library -> size -> ms
 */
export async function runScaling(libs, scenarios, sizes, { maxMs = 2000, samples = 3, log } = {}) {
  const results = {};
  for (const [name, make] of Object.entries(scenarios)) {
    results[name] = {};
    log?.(name);
    for (const [lib, L] of Object.entries(libs)) {
      results[name][lib] = {};
      let skip = false;
      for (const n of sizes) {
        if (skip) {
          results[name][lib][n] = null;
          continue;
        }
        const fn = make(L, n);
        fn();
        const times = [];
        for (let i = 0; i < samples; i++) times.push(sample(fn, 20));
        const ms = median(times);
        results[name][lib][n] = ms;
        if (ms > maxMs) skip = true;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }
  return results;
}
