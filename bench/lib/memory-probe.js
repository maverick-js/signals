/**
 * Measures the bytes retained per node for one library and one kind of node, in a fresh process so
 * nothing from other measurements is on the heap:
 *
 *   node --expose-gc bench/lib/memory-probe.js "<library name>" <signal|computed|effect> <n>
 *
 * Prints the bytes per node. The 8-byte array slot holding each node is subtracted. Uses each
 * library's own constructors (`raw`) so adapter closures are not counted.
 */

import { loadAll } from './node-libs.js';

const [name, kind, count] = process.argv.slice(2);
const n = Number(count);
const { all } = await loadAll();
const L = all[name];
if (!L) throw new Error(`unknown library ${name}`);

const gc = globalThis.gc;
if (!gc) throw new Error('run with --expose-gc');
const heap = () => {
  for (let i = 0; i < 3; i++) gc();
  return process.memoryUsage().heapUsed;
};
const sink = { value: 0 };

// Warm up the code paths once so lazily-created shapes and inline caches are on the heap already.
{
  const s = L.signal(0);
  const c = L.raw.computed(() => s.get());
  sink.value = L.raw.read(c);
  L.root(() => L.effect(() => void (sink.value = s.get())))();
  L.batch(() => {});
}

let slot = 0;
const before = heap();
let keep;
if (kind === 'signal') {
  keep = new Array(n);
  for (let i = 0; i < n; i++) keep[i] = L.raw.signal(i);
  slot = 8;
} else if (kind === 'computed') {
  const s = L.signal(0);
  keep = { s, nodes: new Array(n) };
  for (let i = 0; i < n; i++) {
    keep.nodes[i] = L.raw.computed(() => s.get() + i);
    sink.value = L.raw.read(keep.nodes[i]);
  }
  slot = 8;
} else if (kind === 'effect') {
  const s = L.signal(0);
  keep = {
    s,
    dispose: L.root(() => {
      for (let i = 0; i < n; i++) {
        L.effect(() => {
          sink.value = s.get();
        });
      }
    }),
  };
} else {
  throw new Error(`unknown kind ${kind}`);
}
const after = heap();
console.log(Math.max(0, (after - before) / n - slot).toFixed(1));
// keep `keep` reachable until here.
if (keep === undefined) process.exit(1);
