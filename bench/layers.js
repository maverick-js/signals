/**
 * Extracted from: https://github.com/Riim/cellx#benchmark
 */

import kleur from 'kleur';

import * as reactively from '@reactively/core';
import * as cellx from 'cellx';
import * as Sjs from 's-js';
import * as solid from './solid-js-baseline.js';
import * as preact from '@preact/signals-core';
import * as maverick from '../dist/prod/index.js';
import oby from 'oby';
import Table from 'cli-table';

const BATCHED = true;
const RUNS_PER_TIER = 150;
const LAYER_TIERS = [10, 100, 500, 1000, 2000];

const med = (array) =>
  array.sort((a, b) => (a - b < 0 ? 1 : -1))[Math.floor(array.length / 2)] || 0;

const SOLUTIONS = {
  10: [2, 4, -2, -3],
  100: [-2, -4, 2, 3],
  500: [-2, 1, -4, -4],
  1000: [-2, -4, 2, 3],
  2000: [-2, 1, -4, -4],
  // 2500: [-2, -4, 2, 3],
};

/**
 * @param {number} layers
 * @param {number[]} answer
 */
const isSolution = (layers, answer) => answer.every((_, i) => SOLUTIONS[layers][i] === _);

async function main() {
  const report = {};
  report.maverick = { fn: runMaverick, runs: [], avg: [] };
  report.S = { fn: runS, runs: [] };
  report.solid = { fn: runSolid, runs: [] };
  report.oby = { fn: runOby, runs: [] };

  // Has no way to dispose so can't consider it feature comparable.
  // report.reactively = { fn: runReactively, runs: [], avg: [] };

  // These libraries are not comparable in terms of features.
  // report['preact/signals'] = { fn: runPreact, runs: [] };
  // report.cellx = { fn: runCellx, runs: [] };

  for (const lib of Object.keys(report)) {
    const current = report[lib];

    for (let i = 0; i < LAYER_TIERS.length; i += 1) {
      let layers = LAYER_TIERS[i];
      const runs = [];

      for (let j = 0; j < RUNS_PER_TIER; j += 1) {
        runs.push(await start(current.fn, layers));
      }
      // Give cellx time to release its global pendingCells array
      await new Promise((resolve) => setTimeout(resolve, 0));

      current.runs[i] = med(runs) * 1000;
    }
  }

  const table = new Table({
    head: ['', ...LAYER_TIERS.map((n) => kleur.bold(kleur.cyan(n)))],
  });

  for (let i = 0; i < LAYER_TIERS.length; i += 1) {
    let min = Infinity,
      max = -1,
      fastestLib,
      slowestLib;

    for (const lib of Object.keys(report)) {
      const time = report[lib].runs[i];

      if (time < min) {
        min = time;
        fastestLib = lib;
      }

      if (time > max) {
        max = time;
        slowestLib = lib;
      }
    }

    report[fastestLib].runs[i] = kleur.green(report[fastestLib].runs[i].toFixed(2));
    report[slowestLib].runs[i] = kleur.red(report[slowestLib].runs[i].toFixed(2));
  }

  for (const lib of Object.keys(report)) {
    table.push([
      kleur.magenta(lib),
      ...report[lib].runs.map((n) => (typeof n === 'number' ? n.toFixed(2) : n)),
    ]);
  }

  console.log(table.toString());
}

async function start(runner, layers) {
  return new Promise((done) => {
    runner(layers, done);
  }).catch(() => -1);
}

/**
 * @see {@link https://github.com/modderme123/reactively}
 */
function runReactively(layers, done) {
  const start = {
    a: new reactively.Reactive(1),
    b: new reactively.Reactive(2),
    c: new reactively.Reactive(3),
    d: new reactively.Reactive(4),
  };

  let layer = start;

  for (let i = layers; i--; ) {
    layer = ((m) => {
      return {
        a: new reactively.Reactive(() => m.b.get()),
        b: new reactively.Reactive(() => m.a.get() - m.c.get()),
        c: new reactively.Reactive(() => m.b.get() + m.d.get()),
        d: new reactively.Reactive(() => m.c.get()),
      };
    })(layer);
  }

  const startTime = performance.now();

  start.a.set(4), start.b.set(3), start.c.set(2), start.d.set(1);

  const end = layer;
  const solution = [end.a.get(), end.b.get(), end.c.get(), end.d.get()];
  const endTime = performance.now() - startTime;

  done(isSolution(layers, solution) ? endTime : -1);
}

/**
 * @see {@link https://github.com/maverick-js/signals}
 */
function runMaverick(layers, done) {
  maverick.root((dispose) => {
    const start = {
      a: maverick.signal(1),
      b: maverick.signal(2),
      c: maverick.signal(3),
      d: maverick.signal(4),
    };

    let layer = start;

    for (let i = layers; i--; ) {
      layer = ((m) => {
        return {
          a: maverick.computed(() => m.b()),
          b: maverick.computed(() => m.a() - m.c()),
          c: maverick.computed(() => m.b() + m.d()),
          d: maverick.computed(() => m.c()),
        };
      })(layer);
    }

    const startTime = performance.now();

    start.a.set(4), start.b.set(3), start.c.set(2), start.d.set(1);

    const end = layer;
    const solution = [end.a(), end.b(), end.c(), end.d()];
    const endTime = performance.now() - startTime;

    dispose();
    done(isSolution(layers, solution) ? endTime : -1);
  });
}

/**
 * @see {@link https://github.com/adamhaile/S}
 */
function runS(layers, done) {
  const S = Sjs.default;

  S.root(() => {
    const start = {
      a: S.data(1),
      b: S.data(2),
      c: S.data(3),
      d: S.data(4),
    };

    let layer = start;

    for (let i = layers; i--; ) {
      layer = ((m) => {
        return {
          a: S(() => m.b()),
          b: S(() => m.a() - m.c()),
          c: S(() => m.b() + m.d()),
          d: S(() => m.c()),
        };
      })(layer);
    }

    const startTime = performance.now();

    const run = BATCHED ? (fn) => fn() : (fn) => fn();
    run(() => {
      start.a(4), start.b(3), start.c(2), start.d(1);
    });

    const end = layer;
    const solution = [end.a(), end.b(), end.c(), end.d()];
    const endTime = performance.now() - startTime;

    done(isSolution(layers, solution) ? endTime : -1);
  });
}

/**
 * @see {@link https://github.com/solidjs/solid}
 */
function runSolid(layers, done) {
  solid.createRoot(async (dispose) => {
    const [a, setA] = solid.createSignal(1),
      [b, setB] = solid.createSignal(2),
      [c, setC] = solid.createSignal(3),
      [d, setD] = solid.createSignal(4);

    const start = { a, b, c, d };

    let layer = start;

    for (let i = layers; i--; ) {
      layer = ((m) => {
        const props = {
          a: solid.createMemo(() => m.b()),
          b: solid.createMemo(() => m.a() - m.c()),
          c: solid.createMemo(() => m.b() + m.d()),
          d: solid.createMemo(() => m.c()),
        };

        return props;
      })(layer);
    }

    const startTime = performance.now();

    const run = BATCHED ? solid.batch : (fn) => fn();
    run(() => {
      setA(4), setB(3), setC(2), setD(1);
    });

    const end = layer;
    const solution = [end.a(), end.b(), end.c(), end.d()];
    const endTime = performance.now() - startTime;

    dispose();
    done(isSolution(layers, solution) ? endTime : -1);
  });
}

/**
 * @see {@link https://github.com/preactjs/signals}
 */
function runPreact(layers, done) {
  const a = preact.signal(1),
    b = preact.signal(2),
    c = preact.signal(3),
    d = preact.signal(4);

  const start = { a, b, c, d };

  let layer = start;

  for (let i = layers; i--; ) {
    layer = ((m) => {
      const props = {
        a: preact.computed(() => m.b.value),
        b: preact.computed(() => m.a.value - m.c.value),
        c: preact.computed(() => m.b.value + m.d.value),
        d: preact.computed(() => m.c.value),
      };

      return props;
    })(layer);
  }

  const startTime = performance.now();

  const run = BATCHED ? preact.batch : (fn) => fn();
  run(() => {
    (a.value = 4), (b.value = 3), (c.value = 2), (d.value = 1);

    const end = layer;
    const solution = [end.a.value, end.b.value, end.c.value, end.d.value];
    const endTime = performance.now() - startTime;

    done(isSolution(layers, solution) ? endTime : -1);
  });
}

/**
 * @see {@link https://github.com/Riim/cellx}
 */
function runCellx(layers, done) {
  const start = {
    a: new cellx.Cell(1),
    b: new cellx.Cell(2),
    c: new cellx.Cell(3),
    d: new cellx.Cell(4),
  };

  let layer = start;

  for (let i = layers; i--; ) {
    layer = ((m) => {
      const props = {
        a: new cellx.Cell(() => m.b.get()),
        b: new cellx.Cell(() => m.a.get() - m.c.get()),
        c: new cellx.Cell(() => m.b.get() + m.d.get()),
        d: new cellx.Cell(() => m.c.get()),
      };

      props.a.on('change', function () {});
      props.b.on('change', function () {});
      props.c.on('change', function () {});
      props.d.on('change', function () {});

      return props;
    })(layer);
  }

  const startTime = performance.now();

  start.a.set(4);
  start.b.set(3);
  start.c.set(2);
  start.d.set(1);

  const end = layer;
  const solution = [end.a.get(), end.b.get(), end.c.get(), end.d.get()];
  const endTime = performance.now() - startTime;

  start.a.dispose();
  start.b.dispose();
  start.c.dispose();
  start.d.dispose();

  done(isSolution(layers, solution) ? endTime : -1);
}

/**
 * @see {@link https://github.com/vobyjs/oby}
 */
function runOby(layers, done) {
  const a = oby(1);
  const b = oby(2);
  const c = oby(3);
  const d = oby(4);

  const start = { a, b, c, d };

  let layer = start;

  for (let i = layers; i--; ) {
    layer = ((m) => {
      const props = {
        a: oby.memo(() => m.b()),
        b: oby.memo(() => m.a() - m.c()),
        c: oby.memo(() => m.b() + m.d()),
        d: oby.memo(() => m.c()),
      };

      return props;
    })(layer);
  }

  const startTime = performance.now();

  const run = BATCHED ? oby.batch : (fn) => fn();
  run(() => {
    a(4), b(3), c(2), d(1);
  });

  const end = layer;
  const solution = [end.a(), end.b(), end.c(), end.d()];
  const endTime = performance.now() - startTime;

  done(isSolution(layers, solution) ? endTime : -1);
}

main();
