/**
 * Runs the cross-library comparison scenarios (bench/lib/scenarios.js) inside real browser engines
 * with Playwright and prints one chart block per engine. The libraries, adapters and scenarios are
 * bundled into a single page so nothing is loaded over the network.
 *
 *   pnpm exec playwright install chromium webkit firefox   # once
 *   pnpm build
 *   node bench/browser.js                    # chromium, webkit, firefox
 *   node bench/browser.js --quick --browsers chromium
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rolldown } from 'vite-plus/pack';
import * as playwright from 'playwright';
import { SELF } from './lib/adapters.js';
import { renderPerformance } from './lib/chart.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const argv = process.argv.slice(2);
const quick = argv.includes('--quick');
const browsersArg = argv[argv.indexOf('--browsers') + 1];
const browsers = argv.includes('--browsers')
  ? browsersArg.split(',')
  : ['chromium', 'webkit', 'firefox'];

const pkg = (name) => fileURLToPath(import.meta.resolve(name));
const here = (p) => resolve(root, p);

/** Bundles libraries + adapters + scenarios into one inline module script. */
async function bundlePage() {
  const dir = mkdtempSync(join(root, 'node_modules/.cache-browser-bench-'));
  const entry = join(dir, 'entry.mjs');
  writeFileSync(
    entry,
    `
import * as maverick from '${here('dist/prod/index.js')}';
import * as alien from '${pkg('alien-signals')}';
import * as preact from '${pkg('@preact/signals-core')}';
import * as solid1 from '${here('bench/solid-js-baseline.js')}';
import * as solid2 from '${pkg('@solidjs/signals')}';
import { Signal } from '${pkg('signal-polyfill')}';
import { createAdapters } from '${here('bench/lib/adapters.js')}';
import { createScenarios, runPerformance } from '${here('bench/lib/scenarios.js')}';

window.__signalsBench = async (quick) => {
  const libs = createAdapters({ maverick, alien, preact, solid1, solid2, Signal });
  return runPerformance(libs, createScenarios({ quick }), { quick });
};
window.__signalsBenchReady = true;
`,
  );
  const out = await Rolldown.build({
    input: entry,
    platform: 'browser',
    write: false,
    logLevel: 'silent',
    output: { format: 'esm', minify: false },
  });
  const html = `<!doctype html><meta charset="utf-8"><title>signals bench</title><script type="module">${out.output[0].code}</script>`;
  const file = join(dir, 'index.html');
  writeFileSync(file, html);
  return file;
}

const page = await bundlePage();
const versions = JSON.parse(readFileSync(here('package.json'), 'utf8')).version;
const results = {};

for (const name of browsers) {
  process.stderr.write(`${name}: launching\n`);
  const browser = await playwright[name].launch({ headless: true });
  try {
    const tab = await browser.newPage();
    tab.on('pageerror', (e) => process.stderr.write(`${name}: page error: ${e.message}\n`));
    await tab.goto(`file://${page}`);
    await tab.waitForFunction(() => window.__signalsBenchReady === true);
    const ua = await tab.evaluate(() => navigator.userAgent);
    process.stderr.write(
      `${name}: running (${ua.match(/(Chrome|Firefox|Version)\/[\d.]+/)?.[0] ?? ua})\n`,
    );
    results[name] = await tab.evaluate((q) => window.__signalsBench(q), quick);
  } finally {
    await browser.close();
  }
}

console.log(
  `Measured ${new Date().toISOString().slice(0, 10)}, maverick ${versions}, ${quick ? 'quick mode' : 'full mode'}, headless via Playwright ${playwright.default?.version ?? ''}`.trim(),
);
for (const [name, perf] of Object.entries(results)) {
  console.log(`\n\n== ${name} ${'='.repeat(Math.max(0, 70 - name.length))}\n`);
  console.log(renderPerformance(perf, SELF));
}
