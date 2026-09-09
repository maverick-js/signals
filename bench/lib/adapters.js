/**
 * Adapts every compared library to one shape so the comparison scenarios are written once:
 *
 *   signal(v) -> { get(), set(v) }     computed(fn) -> get       effect(fn) -> stop
 *   root(fn) -> dispose (disposes every effect created inside)   batch(fn) (run, then flush)
 *
 * Environment-agnostic: the caller imports the library modules (Node or a bundled browser page)
 * and passes them in.
 */

export const SELF = 'maverick';

/**
 * @param {object} modules
 * @param {any} modules.maverick   this library (dist/prod/index.js)
 * @param {any} modules.alien      alien-signals
 * @param {any} modules.preact     @preact/signals-core
 * @param {any} modules.solid1     Solid 1.x reactive core (bench/solid-js-baseline.js)
 * @param {any} modules.solid2     @solidjs/signals
 * @param {any} modules.Signal     signal-polyfill's `Signal`
 * @param {Record<string, string>} [versions] library name -> version, for reports
 */
export function createAdapters({ maverick, alien, preact, solid1, solid2, Signal }, versions = {}) {
  const libs = {};

  libs[SELF] = {
    signal: (v) => maverick.signal(v),
    computed: (fn) => {
      const c = maverick.computed(fn);
      return () => c.get();
    },
    effect: (fn) => maverick.effect(fn),
    root: (fn) => maverick.root((dispose) => (fn(), dispose)),
    batch: (fn) => {
      fn();
      maverick.tick();
    },
  };

  libs['alien-signals'] = {
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

  libs['preact'] = collectingRoot({
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

  libs['solid 1.x'] = {
    signal: (v) => {
      const [get, set] = solid1.createSignal(v);
      return { get, set: (v) => set(v) };
    },
    computed: (fn) => solid1.createMemo(fn),
    effect: (fn) => solid1.createRoot((dispose) => (solid1.createComputed(fn), dispose)),
    root: (fn) => solid1.createRoot((dispose) => (fn(), dispose)),
    batch: (fn) => solid1.batch(fn),
  };

  libs['solid 2.x'] = {
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

  // Effects are flushed explicitly by `batch`, so the watcher's notify callback has nothing to do.
  const watcher = new Signal.subtle.Watcher(() => {});
  const flush = () => {
    for (const s of watcher.getPending()) s.get();
    watcher.watch();
  };
  libs['signal-polyfill'] = collectingRoot({
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

  for (const [name, lib] of Object.entries(libs)) lib.version = versions[name] ?? '';
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
