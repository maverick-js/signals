/**
 * Reactively-style dependency-graph benchmark: `current` (dist/prod) vs `baseline` (bench/.baseline).
 *
 *   pnpm bench:graph            # or: vitest bench --run bench/graph
 *   BENCH_QUICK=1 pnpm bench:graph
 *
 * A graph is `width` signals (layer 0) followed by `depth` layers of `width` computeds. Each
 * computed sums `nSources` seeded-random nodes of the previous layer. A `dynamicFraction` of the
 * computeds are dynamic: they pick between two source sets depending on the parity of their first
 * source's value, so their dependencies change at runtime.
 *
 * Each iteration sets one seeded-random layer-0 signal to a new value, calls `tick()` and reads
 * `readFraction` of the leaves. Two variants are measured:
 *
 * - pull: leaves are read directly (lazy re-computation on read)
 * - push: a single effect observes all leaves (re-computation is driven by `tick()`)
 *
 * Before a scenario is benchmarked it is run once per library and the total number of computed
 * executions is asserted to be identical - otherwise the libraries are not doing the same work.
 *
 * @see {@link https://github.com/milomg/reactively/tree/main/packages/bench}
 */

import { loadLibs } from './lib/load.js';
import * as random from './lib/rng.js';
import * as helpers from './lib/scenario.js';

// Local bindings: inside a vitest worker every access to an imported name goes through a module
// getter, which adds overhead to hot loops (see "Module runner overhead" in bench/README.md).
const { rng } = random;
const { quick, scenario, sink } = helpers;

const libs = loadLibs();

/** Iterations per timed call: quick mode divides by 4. */
const ITER = (n) => (quick ? Math.max(1, Math.ceil(n / 4)) : n);

/**
 * @typedef {import('./lib/load.js').Lib} Lib
 *
 * @typedef {object} GraphConfig
 * @property {number} width           signals in layer 0 and computeds per layer
 * @property {number} depth           number of computed layers
 * @property {number} nSources        sources read by each computed
 * @property {number} dynamicFraction fraction of computeds with runtime-dependent sources
 * @property {number} readFraction    fraction of leaves read after each write
 * @property {number} seed
 *
 * @typedef {object} Graph
 * @property {Array<{ get: () => number, set: (v: number) => void }>} sources layer-0 signals
 * @property {Array<Array<{ get: () => number }>>} layers computed layers (last one = leaves)
 * @property {Array<{ get: () => number }>} leaves
 * @property {Array<{ get: () => number }>} readLeaves leaves read on every iteration
 * @property {{ count: number }} counter number of computed executions
 * @property {any} scope the root scope (use with `scoped()` to attach observers to the graph)
 * @property {() => void} dispose
 */

/**
 * Builds a graph with the given library. The structure (random source picks, which nodes are
 * dynamic, which leaves are read) depends only on `config.seed`, so every library gets exactly
 * the same graph.
 *
 * @param {Lib} lib
 * @param {GraphConfig} config
 * @returns {Graph}
 */
export function makeGraph(lib, config) {
  const { width, depth, nSources, dynamicFraction, readFraction, seed } = config;
  const rand = rng(seed);
  const counter = { count: 0 };

  return lib.root((dispose) => {
    const scope = lib.getScope();
    const sources = Array.from({ length: width }, (_, i) => lib.signal(i));

    /** @type {Array<Array<{ get: () => number }>>} */
    const layers = [];
    /** @type {Array<{ get: () => number }>} */
    let prev = sources;

    for (let l = 0; l < depth; l++) {
      /** @type {Array<{ get: () => number }>} */
      const layer = new Array(width);

      for (let i = 0; i < width; i++) {
        const picks = Array.from({ length: nSources }, () => prev[rand.int(prev.length)]);
        const dynamic = rand() < dynamicFraction;

        if (!dynamic) {
          layer[i] = lib.computed(() => {
            counter.count++;
            let sum = 0;
            for (let j = 0; j < picks.length; j++) sum += picks[j].get();
            return sum;
          });
        } else {
          // Alternative source set (same first source so the switch itself is always tracked).
          const alt = picks.map((p, j) => (j === 0 ? p : prev[rand.int(prev.length)]));
          const first = picks[0];
          layer[i] = lib.computed(() => {
            counter.count++;
            const head = first.get();
            const set = head & 1 ? alt : picks;
            let sum = head;
            for (let j = 1; j < set.length; j++) sum += set[j].get();
            return sum;
          });
        }
      }

      layers.push(layer);
      prev = layer;
    }

    const leaves = layers[layers.length - 1];
    const readCount = Math.max(1, Math.round(leaves.length * readFraction));
    const readLeaves = leaves.slice();
    // Seeded partial shuffle to choose which leaves are read.
    for (let i = 0; i < readCount; i++) {
      const j = i + rand.int(readLeaves.length - i);
      const t = readLeaves[i];
      readLeaves[i] = readLeaves[j];
      readLeaves[j] = t;
    }
    readLeaves.length = readCount;

    return { sources, layers, leaves, readLeaves, counter, scope, dispose };
  });
}

/**
 * Runs `iterations` write/tick/read cycles against the graph.
 *
 * @param {Lib} lib
 * @param {Graph} graph
 * @param {number} iterations
 * @param {number} seed
 */
export function runGraph(lib, graph, iterations, seed) {
  const rand = rng(seed);
  const { sources, readLeaves } = graph;
  let sum = 0;

  for (let i = 1; i <= iterations; i++) {
    const source = sources[rand.int(sources.length)];
    source.set(source.get() + i);
    lib.tick();
    for (let j = 0; j < readLeaves.length; j++) sum += readLeaves[j].get();
  }

  sink.value = sum;
  return sum;
}

/**
 * Builds the graph for a scenario and brings it to its steady state (untimed): `push` attaches an
 * effect over all leaves (creating it computes the whole graph once), `pull` reads every leaf
 * once. The execution counter is reset afterwards.
 *
 * @param {Lib} lib
 * @param {GraphConfig} config
 * @param {'pull' | 'push'} mode
 */
function setupGraph(lib, config, mode) {
  const graph = makeGraph(lib, config);
  if (mode === 'push') {
    // Attach the observing effect inside the graph's root so `graph.dispose()` stops it.
    lib.scoped(() => {
      lib.effect(() => {
        let sum = 0;
        for (let i = 0; i < graph.leaves.length; i++) sum += graph.leaves[i].get();
        sink.value = sum;
      });
    }, graph.scope);
  } else {
    for (let i = 0; i < graph.leaves.length; i++) sink.value = graph.leaves[i].get();
  }
  graph.counter.count = 0;
  return graph;
}

/**
 * @type {Array<{ name: string, config: Omit<GraphConfig, 'seed'>, iterations: number }>}
 */
const configs = [
  {
    name: 'w10 d10 static',
    config: { width: 10, depth: 10, nSources: 2, dynamicFraction: 0, readFraction: 0.5 },
    iterations: 16_000,
  },
  {
    name: 'w10 d10 dynamic 0.5',
    config: { width: 10, depth: 10, nSources: 4, dynamicFraction: 0.5, readFraction: 0.5 },
    iterations: 16_000,
  },
  {
    name: 'w1000 d5 static',
    config: { width: 1000, depth: 5, nSources: 4, dynamicFraction: 0, readFraction: 1 },
    iterations: 320,
  },
  {
    name: 'w1000 d5 dynamic 0.5',
    config: { width: 1000, depth: 5, nSources: 4, dynamicFraction: 0.5, readFraction: 1 },
    iterations: 320,
  },
  {
    name: 'w100 d50 static',
    config: { width: 100, depth: 50, nSources: 3, dynamicFraction: 0, readFraction: 1 },
    iterations: 320,
  },
  {
    name: 'w2 d1000 static (deep)',
    config: { width: 2, depth: 1000, nSources: 2, dynamicFraction: 0, readFraction: 1 },
    iterations: 480,
  },
  {
    name: 'w1000 d12 dynamic 0.5 (large app)',
    config: { width: 1000, depth: 12, nSources: 4, dynamicFraction: 0.5, readFraction: 1 },
    iterations: 160,
  },
];

for (const entry of configs) {
  for (const mode of /** @type {const} */ (['pull', 'push'])) {
    const iterations = ITER(entry.iterations);
    const config = { ...entry.config, seed: 1234 };

    scenario(
      libs,
      `${entry.name} [${mode}] x${iterations}`,
      (lib) => {
        let graph;
        return {
          beforeAll: () => void (graph = setupGraph(lib, config, mode)),
          fn: () => runGraph(lib, graph, iterations, 99),
          afterAll: () => graph.dispose(),
        };
      },
      {
        checkLabel: 'computeds run',
        check(lib) {
          const graph = setupGraph(lib, config, mode);
          runGraph(lib, graph, iterations, 99);
          graph.dispose();
          return graph.counter.count;
        },
      },
    );
  }
}
