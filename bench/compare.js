/**
 * Cross-library comparison: performance on nine graph shapes and tree-shaken bundle size, for this
 * library against alien-signals, @preact/signals-core, Solid 1.x (vendored core), @solidjs/signals
 * 2.x and the TC39 signal-polyfill. Renders text bar charts and can rewrite the README section
 * between the `<!-- bench:start -->` / `<!-- bench:end -->` markers.
 *
 *   pnpm build                       # the "maverick" column is dist/prod
 *   node bench/compare.js            # print the charts
 *   node bench/compare.js --quick    # smaller sizes, fewer samples (smoke test)
 *   node bench/compare.js --update-readme
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { Rolldown } from 'vite-plus/pack';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const quick = args.has('--quick');
const SELF = 'maverick';

/** Version of an installed package (read directly, since some packages don't export package.json). */
const version = (name) =>
  JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')).version;

// ---------------------------------------------------------------------------------------------
// Libraries
// ---------------------------------------------------------------------------------------------

/**
 * Every library is adapted to one shape so the scenarios are written once:
 * `signal(v) -> { get(), set(v) }`, `computed(fn) -> get`, `effect(fn) -> stop`,
 * `root(fn) -> dispose` (disposes every effect created inside), `batch(fn)` (runs `fn`, then
 * flushes effects).
 */
async function loadLibraries() {
  const libs = {};

  const mav = await import(resolve(root, 'dist/prod/index.js')).catch(() => {
    throw new Error('dist/prod is missing - run `pnpm build` first.');
  });
  libs[SELF] = {
    version: JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version,
    signal: (v) => mav.signal(v),
    computed: (fn) => {
      const c = mav.computed(fn);
      return () => c.get();
    },
    effect: (fn) => mav.effect(fn),
    root: (fn) => mav.root((dispose) => (fn(), dispose)),
    batch: (fn) => {
      fn();
      mav.tick();
    },
  };

  const alien = await import('alien-signals');
  libs['alien-signals'] = {
    version: version('alien-signals'),
    signal: (v) => {
      const s = alien.signal(v);
      return { get: () => s(), set: (v) => s(v) };
    },
    computed: (fn) => alien.computed(fn),
    effect: (fn) => alien.effect(fn),
    root: (fn) => alien.effectScope(fn),
    batch: (fn) => {
      alien.startBatch();
      fn();
      alien.endBatch();
    },
  };

  const preact = await import('@preact/signals-core');
  libs['preact'] = collectingRoot({
    version: version('@preact/signals-core'),
    signal: (v) => {
      const s = preact.signal(v);
      return {
        get: () => s.value,
        set: (v) => {
          s.value = v;
        },
      };
    },
    computed: (fn) => {
      const c = preact.computed(fn);
      return () => c.value;
    },
    effect: (fn) => preact.effect(fn),
    batch: (fn) => preact.batch(fn),
  });

  const solid1 = await import('./solid-js-baseline.js');
  libs['solid 1.x'] = {
    version: version('solid-js'),
    signal: (v) => {
      const [get, set] = solid1.createSignal(v);
      return { get, set: (v) => set(v) };
    },
    computed: (fn) => solid1.createMemo(fn),
    effect: (fn) => solid1.createRoot((dispose) => (solid1.createComputed(fn), dispose)),
    root: (fn) => solid1.createRoot((dispose) => (fn(), dispose)),
    batch: (fn) => solid1.batch(fn),
  };

  const solid2 = await import('@solidjs/signals');
  libs['solid 2.x'] = {
    version: version('@solidjs/signals'),
    signal: (v) => {
      const [get, set] = solid2.createSignal(v);
      return { get, set: (v) => set(v) };
    },
    computed: (fn) => solid2.createMemo(fn),
    effect: (fn) => solid2.createRoot((dispose) => (solid2.createTrackedEffect(fn), dispose)),
    root: (fn) => {
      const dispose = solid2.createRoot((dispose) => (fn(), dispose));
      solid2.flush(); // effects created inside only run on flush.
      return dispose;
    },
    batch: (fn) => {
      fn();
      solid2.flush();
    },
  };

  const { Signal } = await import('signal-polyfill');
  // Effects are flushed explicitly by `batch`, so the watcher's notify callback has nothing to do.
  const watcher = new Signal.subtle.Watcher(() => {});
  const flush = () => {
    for (const s of watcher.getPending()) s.get();
    watcher.watch();
  };
  libs['signal-polyfill'] = collectingRoot({
    version: version('signal-polyfill'),
    signal: (v) => {
      const s = new Signal.State(v);
      return { get: () => s.get(), set: (v) => s.set(v) };
    },
    computed: (fn) => {
      const c = new Signal.Computed(fn);
      return () => c.get();
    },
    // The effect pattern from the proposal README.
    effect: (fn) => {
      let destructor;
      const c = new Signal.Computed(() => {
        destructor?.();
        destructor = fn();
      });
      watcher.watch(c);
      c.get();
      return () => {
        destructor?.();
        watcher.unwatch(c);
      };
    },
    batch: (fn) => {
      fn();
      flush();
    },
  });

  return libs;
}

/** Gives a library without ownership a `root()` that disposes every effect created inside it. */
function collectingRoot(lib) {
  let collecting = null;
  const effect = lib.effect;
  lib.effect = (fn) => {
    const dispose = effect(fn);
    if (collecting) collecting.push(dispose);
    return dispose;
  };
  lib.root = (fn) => {
    const prev = collecting,
      mine = (collecting = []);
    fn();
    collecting = prev;
    return () => {
      for (const dispose of mine) dispose();
    };
  };
  return lib;
}

// ---------------------------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------------------------

const sink = { value: 0 };
const range = (n) => Array.from({ length: n }, (_, i) => i);
const N = (n) => (quick ? Math.max(1, Math.round(n / 4)) : n);

/** Each scenario returns a timed function; setup outside it is untimed. */
const scenarios = {
  [`Create ${N(10_000) / 1000}k signals + computeds`]: (L) => () => {
    const dispose = L.root(() => {
      for (let i = 0; i < N(10_000); i++) {
        const s = L.signal(i);
        const c = L.computed(() => s.get() + 1);
        sink.value = c();
      }
    });
    dispose();
  },
  [`Create ${N(10_000) / 1000}k effects, then dispose`]: (L) => () => {
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
  [`Static deps: 5 sources, set + read ×${N(200_000) / 1000}k`]: (L) => {
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
  [`Dynamic deps: toggle 2 sets of 10 ×${N(100_000) / 1000}k`]: (L) => {
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
  [`Batch: 100 signals → 1 effect ×${N(4000) / 1000}k`]: (L) => {
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
  [`Dispose ${N(10_000) / 1000}k effects on one signal`]: (L) => () => {
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

const median = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];

async function runPerformance(libs) {
  const rounds = quick ? 2 : 3,
    samples = quick ? 3 : 5,
    warmup = quick ? 1 : 2;
  const results = {};
  for (const [name, make] of Object.entries(scenarios)) {
    results[name] = {};
    process.stderr.write(`  ${name}\n`);
    for (let round = 0; round < rounds; round++) {
      // Interleave libraries within a round so drift affects them equally.
      for (const [lib, L] of Object.entries(libs)) {
        const fn = make(L);
        for (let i = 0; i < warmup; i++) fn();
        const times = [];
        for (let i = 0; i < samples; i++) {
          globalThis.gc?.();
          const start = performance.now();
          fn();
          times.push(performance.now() - start);
        }
        results[name][lib] = Math.min(results[name][lib] ?? Infinity, median(times));
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------------------------
// Bundle size
// ---------------------------------------------------------------------------------------------

async function measureSizes() {
  // Absolute paths so the bundler never treats a bare specifier as external.
  const ours = resolve(root, 'dist/prod/index.js'),
    oursMap = resolve(root, 'dist/prod/map.js'),
    pkg = (name) => fileURLToPath(import.meta.resolve(name));
  const entries = [
    [SELF, 'signal + computed', `export { signal, computed } from '${ours}';`],
    [SELF, '+ effect', `export { signal, computed, effect } from '${ours}';`],
    [
      SELF,
      'basics (+ root, tick, peek, onDispose)',
      `export { signal, computed, effect, root, tick, peek, onDispose } from '${ours}';`,
    ],
    [SELF, 'everything (maps, selector)', `export * from '${ours}'; export * from '${oursMap}';`],
    ['alien-signals', 'everything', `export * from '${pkg('alien-signals')}';`],
    ['preact', 'everything', `export * from '${pkg('@preact/signals-core')}';`],
    [
      'solid 2.x',
      'basics (signal, memo, effect, root, flush)',
      `export { createSignal, createMemo, createEffect, createRoot, flush } from '${pkg('@solidjs/signals')}';`,
    ],
    ['signal-polyfill', 'Signal namespace', `export { Signal } from '${pkg('signal-polyfill')}';`],
  ];
  const dir = mkdtempSync(join(root, 'node_modules/.cache-compare-'));
  const rows = [];
  for (const [lib, label, code] of entries) {
    const file = join(dir, `${rows.length}.mjs`);
    writeFileSync(file, code);
    const out = await Rolldown.build({
      input: file,
      platform: 'neutral',
      write: false,
      logLevel: 'silent',
      output: { format: 'esm', minify: true },
    });
    const js = Buffer.from(out.output[0].code);
    rows.push({
      lib,
      label,
      min: js.length,
      gzip: gzipSync(js, { level: 9 }).length,
      brotli: brotliCompressSync(js).length,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

const BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
const BAR = 26;

/** A bar of `value / max` scaled to `BAR` cells, with eighth-block fractional ends. */
function bar(value, max) {
  const cells = (Math.min(value, max) / max) * BAR;
  const full = Math.floor(cells),
    frac = Math.round((cells - full) * 8);
  return '█'.repeat(full) + (frac === 8 ? '█' : BLOCKS[frac]);
}

/** Clip a lone outlier (more than 6x the runner-up) so the other bars stay readable. */
function scale(values) {
  const sorted = values.slice().sort((a, b) => b - a);
  return sorted.length > 1 && sorted[0] > 6 * sorted[1] ? sorted[1] * 2.2 : sorted[0];
}

const fmtMs = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + ' ms';
const fmtKb = (b) => (b / 1024).toFixed(2) + ' kB';

function chart(title, rows, fmt, { relativeTo } = {}) {
  const max = scale(rows.map((r) => r.value));
  const nameWidth = Math.max(...rows.map((r) => r.name.length));
  const lines = [title];
  for (const r of rows) {
    const clipped = r.value > max;
    const b = (bar(r.value, max) + (clipped ? '»' : '')).padEnd(BAR + 1);
    const rel = relativeTo != null ? `  ${(r.value / relativeTo).toFixed(2)}×` : '';
    lines.push(`  ${r.name.padEnd(nameWidth)}  ${b} ${fmt(r.value).padStart(9)}${rel}`);
  }
  return lines.join('\n');
}

function render(libs, perf, sizes) {
  const parts = [];
  parts.push('Performance (ms, lower is better; ×: relative to maverick)');
  for (const [scenario, r] of Object.entries(perf)) {
    const rows = Object.keys(libs).map((lib) => ({ name: lib, value: r[lib] }));
    parts.push('', chart(scenario, rows, fmtMs, { relativeTo: r[SELF] }));
  }
  parts.push('', '', 'Bundle size (minified + gzipped, tree-shaken from the listed entry)');
  parts.push(
    '',
    chart(
      'min + gzip',
      sizes.map((s) => ({ name: `${s.lib}: ${s.label}`, value: s.gzip })),
      fmtKb,
    ),
  );
  return parts.join('\n');
}

function metadata(libs) {
  const versions = Object.entries(libs)
    .map(([name, L]) => `${name} ${L.version}`)
    .join(', ');
  const cpu = cpus()[0]?.model ?? 'unknown CPU';
  return `Measured ${new Date().toISOString().slice(0, 10)} on ${cpu}, Node ${process.versions.node}. Libraries: ${versions}. Same process, each scenario best of 3 rounds of the median of 5 timed runs after warm-up. Bars ending in » are clipped; the value is exact.`;
}

// ---------------------------------------------------------------------------------------------

const libs = await loadLibraries();
process.stderr.write('Running scenarios...\n');
const perf = await runPerformance(libs);
process.stderr.write('Measuring bundle sizes...\n');
const sizes = await measureSizes();
const text = render(libs, perf, sizes);

if (args.has('--update-readme') && !quick) {
  const readme = resolve(root, 'README.md');
  const src = readFileSync(readme, 'utf8');
  const start = '<!-- bench:start -->',
    end = '<!-- bench:end -->';
  const a = src.indexOf(start),
    b = src.indexOf(end);
  if (a === -1 || b === -1) throw new Error(`README.md is missing the ${start} / ${end} markers.`);
  const section = `${start}\n\n${metadata(libs)}\n\n\`\`\`\n${text}\n\`\`\`\n\n${end}`;
  writeFileSync(readme, src.slice(0, a) + section + src.slice(b + end.length));
  process.stderr.write('README.md updated.\n');
} else {
  console.log(metadata(libs));
  console.log();
  console.log(text);
  if (args.has('--update-readme'))
    process.stderr.write('(--quick results are not written to the README)\n');
}
