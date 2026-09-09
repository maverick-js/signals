/**
 * Cross-library comparison for this library against alien-signals, @preact/signals-core, Solid 1.x
 * (vendored core), @solidjs/signals 2.x and the TC39 signal-polyfill:
 *
 *   - performance on nine graph shapes (bench/lib/scenarios.js)
 *   - disposal cost as the graph grows, with the previous release (bench/.baseline) as an extra row
 *   - tree-shaken bundle size
 *   - memory retained per signal / computed / effect
 *
 * Renders text bar charts and can rewrite the README section between the `<!-- bench:start -->` /
 * `<!-- bench:end -->` markers.
 *
 *   pnpm build && pnpm bench:baseline v6.0.0
 *   node bench/compare.js                  # print the charts
 *   node bench/compare.js --quick          # smaller sizes, fewer samples (smoke test)
 *   node bench/compare.js --update-readme
 *
 * `bench/browser.js` runs the nine scenarios inside real browser engines.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { Rolldown } from 'vite-plus/pack';
import { SELF } from './lib/adapters.js';
import { renderMemory, renderPerformance, renderScaling, renderSizes } from './lib/chart.js';
import {
  createScalingScenarios,
  createScenarios,
  runPerformance,
  runScaling,
} from './lib/scenarios.js';
import { loadAll, root } from './lib/node-libs.js';

const args = new Set(process.argv.slice(2));
const quick = args.has('--quick');
const log = (line) => process.stderr.write(`  ${line}\n`);

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

/**
 * Bytes retained per node, measured by bench/lib/memory-probe.js in a fresh process per library and
 * kind, so deferred teardown or leftovers from other measurements can't skew the baseline heap.
 */
function measureMemory(libNames, n) {
  const probe = resolve(root, 'bench/lib/memory-probe.js');
  const memory = {
    'signal (holding a number)': {},
    'computed (one dependency, read once)': {},
    'effect (one dependency)': {},
  };
  const kinds = {
    'signal (holding a number)': 'signal',
    'computed (one dependency, read once)': 'computed',
    'effect (one dependency)': 'effect',
  };
  for (const name of libNames) {
    log(`memory: ${name}`);
    for (const [label, kind] of Object.entries(kinds)) {
      const out = execFileSync(process.execPath, ['--expose-gc', probe, name, kind, String(n)], {
        cwd: root,
        encoding: 'utf8',
      });
      memory[label][name] = Number(out.trim());
    }
  }
  return memory;
}

function metadata(libs, baseline) {
  const versions = Object.entries(libs)
    .map(([name, L]) => `${name} ${L.version}`)
    .join(', ');
  const cpu = cpus()[0]?.model ?? 'unknown CPU';
  return (
    `Measured ${new Date().toISOString().slice(0, 10)} on ${cpu}, Node ${process.versions.node}. ` +
    `Libraries: ${versions}${baseline ? `; previous release: ${baseline.name}` : ''}. ` +
    'Same process, each scenario best of 3 rounds of the median of 5 samples after warm-up; a sample ' +
    'repeats the operation for at least 20 ms and reports the time per call. Memory is the heap ' +
    'delta after a full collection for 100k nodes of each kind, median of 3. Bars ending in » are ' +
    'clipped; the value is exact.'
  );
}

// ---------------------------------------------------------------------------------------------

const { libs, baseline, all: withBaseline } = await loadAll();
if (!baseline) {
  process.stderr.write(
    'No bench/.baseline - run `pnpm bench:baseline v6.0.0` for the "previous release" row.\n',
  );
}

process.stderr.write('Running scenarios...\n');
const perf = await runPerformance(libs, createScenarios({ quick }), { quick, log });

process.stderr.write('Disposal scaling...\n');
const sizes = quick ? [1000, 5000] : [1000, 10_000, 50_000];
const scaling = await runScaling(withBaseline, createScalingScenarios(), sizes, { log });

process.stderr.write('Measuring bundle sizes...\n');
const bundle = await measureSizes();

process.stderr.write('Measuring memory...\n');
const memory = measureMemory(Object.keys(withBaseline), quick ? 20_000 : 100_000);

const HEADLINE = [/^Static deps/, /^Batch/, /^Deep chain/];
const headline = Object.fromEntries(
  Object.entries(perf).filter(([k]) => HEADLINE.some((re) => re.test(k))),
);

const blocks = {
  headline: renderPerformance(
    headline,
    SELF,
    'Headline (ms per call, lower is better; ×: relative to maverick)',
  ),
  scaling: renderScaling(scaling, sizes),
  all: renderPerformance(
    perf,
    SELF,
    'All scenarios (ms per call, lower is better; ×: relative to maverick)',
  ),
  size: renderSizes(bundle),
  memory: renderMemory(memory),
};

const fence = (text) => `\`\`\`\n${text}\n\`\`\``;

if (args.has('--update-readme') && !quick) {
  const readme = resolve(root, 'README.md');
  const src = readFileSync(readme, 'utf8');
  const start = '<!-- bench:start -->',
    end = '<!-- bench:end -->';
  const a = src.indexOf(start),
    b = src.indexOf(end);
  if (a === -1 || b === -1) throw new Error(`README.md is missing the ${start} / ${end} markers.`);
  const section = [
    start,
    '',
    metadata(libs, baseline),
    '',
    fence(`${blocks.headline}\n\n\n${blocks.scaling}`),
    '',
    '<details>',
    '<summary>All nine scenarios</summary>',
    '',
    fence(blocks.all),
    '',
    '</details>',
    '',
    fence(blocks.size + `\n\n\n${blocks.memory}`),
    '',
    end,
  ].join('\n');
  writeFileSync(readme, src.slice(0, a) + section + src.slice(b + end.length));
  process.stderr.write('README.md updated.\n');
} else {
  console.log(metadata(libs, baseline));
  for (const block of [blocks.headline, blocks.scaling, blocks.all, blocks.size, blocks.memory]) {
    console.log('\n\n' + block);
  }
  if (args.has('--update-readme'))
    process.stderr.write('(--quick results are not written to the README)\n');
}
