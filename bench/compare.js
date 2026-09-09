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
 *
 * `bench/browser.js` runs the same scenarios inside real browser engines.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { Rolldown } from 'vite-plus/pack';
import { SELF, createAdapters } from './lib/adapters.js';
import { renderPerformance, renderSizes } from './lib/chart.js';
import { createScenarios, runPerformance } from './lib/scenarios.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const quick = args.has('--quick');

/** Version of an installed package (read directly, since some packages don't export package.json). */
export const version = (name) =>
  JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')).version;

/** Library name -> installed version, for report headers. */
export function libraryVersions() {
  return {
    [SELF]: JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version,
    'alien-signals': version('alien-signals'),
    preact: version('@preact/signals-core'),
    'solid 1.x': version('solid-js'),
    'solid 2.x': version('@solidjs/signals'),
    'signal-polyfill': version('signal-polyfill'),
  };
}

async function loadLibraries() {
  const maverick = await import(resolve(root, 'dist/prod/index.js')).catch(() => {
    throw new Error('dist/prod is missing - run `pnpm build` first.');
  });
  return createAdapters(
    {
      maverick,
      alien: await import('alien-signals'),
      preact: await import('@preact/signals-core'),
      solid1: await import('./solid-js-baseline.js'),
      solid2: await import('@solidjs/signals'),
      Signal: (await import('signal-polyfill')).Signal,
    },
    libraryVersions(),
  );
}

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

function metadata(libs) {
  const versions = Object.entries(libs)
    .map(([name, L]) => `${name} ${L.version}`)
    .join(', ');
  const cpu = cpus()[0]?.model ?? 'unknown CPU';
  return `Measured ${new Date().toISOString().slice(0, 10)} on ${cpu}, Node ${process.versions.node}. Libraries: ${versions}. Same process, each scenario best of 3 rounds of the median of 5 samples after warm-up; a sample repeats the operation for at least 20 ms and reports the time per call. Bars ending in » are clipped; the value is exact.`;
}

const libs = await loadLibraries();
process.stderr.write('Running scenarios...\n');
const perf = await runPerformance(libs, createScenarios({ quick }), {
  quick,
  log: (name) => process.stderr.write(`  ${name}\n`),
});
process.stderr.write('Measuring bundle sizes...\n');
const sizes = await measureSizes();
const text = `${renderPerformance(perf, SELF)}\n\n\n${renderSizes(sizes)}`;

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
