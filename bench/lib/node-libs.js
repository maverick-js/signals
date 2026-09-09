/**
 * Node-side loading of the compared libraries (dist/prod for this library, the installed packages
 * for the others, and the previous release from bench/.baseline), adapted to the scenario shape.
 * Shared by bench/compare.js and bench/lib/memory-probe.js.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SELF, createAdapters } from './adapters.js';

export const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

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

export async function loadLibraries() {
  const maverick = await import(resolve(root, 'dist/prod/index.js')).catch(() => {
    throw new Error('dist/prod is missing - run `pnpm build` first.');
  });
  return createAdapters(
    {
      maverick,
      alien: await import('alien-signals'),
      preact: await import('@preact/signals-core'),
      solid1: await import('../solid-js-baseline.js'),
      solid2: await import('@solidjs/signals'),
      Signal: (await import('signal-polyfill')).Signal,
    },
    libraryVersions(),
  );
}

/**
 * The previous release, built by `bench/build-baseline.js` into bench/.baseline, adapted to the
 * scenario shape (callable pre-7.0 API or the object API). Returns `null` when no baseline exists.
 */
export async function loadBaseline() {
  const file = resolve(root, 'bench/.baseline/index.js');
  if (!existsSync(file)) return null;
  const old = await import(file);
  const ref = readFileSync(resolve(root, 'bench/.baseline/REF'), 'utf8').split('\n')[0].trim();
  const legacy = typeof old.signal(0) === 'function';
  const lib = legacy
    ? {
        raw: { signal: (v) => old.signal(v), computed: (fn) => old.computed(fn), read: (c) => c() },
        signal: (v) => {
          const s = old.signal(v);
          return { get: s, set: s.set };
        },
        computed: (fn) => old.computed(fn),
      }
    : {
        raw: {
          signal: (v) => old.signal(v),
          computed: (fn) => old.computed(fn),
          read: (c) => c.get(),
        },
        signal: (v) => old.signal(v),
        computed: (fn) => {
          const c = old.computed(fn);
          return () => c.get();
        },
      };
  lib.effect = (fn) => old.effect(fn);
  lib.root = (fn) => old.root((dispose) => (fn(), dispose));
  lib.batch = (fn) => {
    fn();
    old.tick();
  };
  lib.version = ref;
  return { name: `maverick ${ref}`, lib };
}

/** All libraries plus the previous release (when built), keyed by report name. */
export async function loadAll() {
  const libs = await loadLibraries();
  const baseline = await loadBaseline();
  return { libs, baseline, all: baseline ? { ...libs, [baseline.name]: baseline.lib } : libs };
}
