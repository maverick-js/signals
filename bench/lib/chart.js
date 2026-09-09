/** Text bar charts for the comparison reports (README and CLI). */

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

export const fmtMs = (v) =>
  (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + ' ms';
export const fmtKb = (b) => (b / 1024).toFixed(2) + ' kB';

/**
 * @param {string} title
 * @param {{ name: string, value: number }[]} rows
 * @param {(v: number) => string} fmt
 * @param {{ relativeTo?: number }} [options] append a `×` column relative to this value
 */
export function chart(title, rows, fmt, { relativeTo } = {}) {
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

/** One chart per scenario, relative to `self`. */
export function renderPerformance(
  perf,
  self,
  title = 'Performance (ms, lower is better; ×: relative to maverick)',
) {
  const parts = [title];
  for (const [scenario, r] of Object.entries(perf)) {
    const rows = Object.keys(r).map((lib) => ({ name: lib, value: r[lib] }));
    parts.push('', chart(scenario, rows, fmtMs, { relativeTo: r[self] }));
  }
  return parts.join('\n');
}

/** @param {{ lib: string, label: string, gzip: number }[]} sizes */
export function renderSizes(sizes) {
  return [
    'Bundle size (minified + gzipped, tree-shaken from the listed entry)',
    '',
    chart(
      'min + gzip',
      sizes.map((s) => ({ name: `${s.lib}: ${s.label}`, value: s.gzip })),
      fmtKb,
    ),
  ].join('\n');
}
