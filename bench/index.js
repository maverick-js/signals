/**
 * Runs all benchmark suites (synthetic, graph, dom) in sequence, each in its own node process so
 * JIT state and heap from one suite cannot influence the next.
 *
 *   node bench/index.js [--quick] [--filter <substring>] [--calibrate] [--samples n] [--warmup n]
 *                       [--only synthetic,graph,dom]
 *
 * All flags are forwarded to every suite.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import kleur from 'kleur';

const dir = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(
    [
      'node bench/index.js [options]',
      '',
      '  --quick                 smaller sizes / fewer samples',
      '  --filter <substring>    only run benchmarks whose name contains <substring> (comma separated)',
      '  --calibrate             A/A test: baseline = independent copy of dist/prod (noise floor)',
      '  --samples <n>           override total sample count (split across rounds)',
      '  --warmup <n>            override warm-up count (per round)',
      '  --rounds <n>            rounds with fresh module instances (default 3, 2 with --quick)',
      '  --only <suites>         comma separated subset of: synthetic,graph,dom',
    ].join('\n'),
  );
  process.exit(0);
}

const SUITES = ['synthetic', 'graph', 'dom'];

let only = SUITES;
const forwarded = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--only') {
    only = String(argv[++i] ?? '')
      .split(',')
      .filter(Boolean);
  } else if (argv[i].startsWith('--only=')) {
    only = argv[i].slice('--only='.length).split(',').filter(Boolean);
  } else {
    forwarded.push(argv[i]);
  }
}

for (const suite of only) {
  if (!SUITES.includes(suite)) {
    console.error(kleur.red(`Unknown suite "${suite}". Expected one of: ${SUITES.join(', ')}`));
    process.exit(1);
  }
}

const execArgv = process.execArgv.includes('--expose-gc')
  ? process.execArgv
  : ['--expose-gc', ...process.execArgv];

const started = performance.now();
let failed = 0;

for (const suite of only) {
  console.log(kleur.bold().cyan(`\n== ${suite} ${'='.repeat(Math.max(0, 70 - suite.length))}`));
  const result = spawnSync(
    process.execPath,
    [...execArgv, path.join(dir, `${suite}.js`), ...forwarded],
    { stdio: 'inherit', env: { ...process.env, BENCH_NO_RESPAWN: '1' } },
  );
  if (result.status !== 0) {
    failed++;
    console.error(kleur.red(`suite "${suite}" exited with code ${result.status}`));
  }
}

console.log(
  kleur.dim(`\nall suites finished in ${((performance.now() - started) / 1000).toFixed(1)}s`),
);

process.exitCode = failed ? 1 : 0;
