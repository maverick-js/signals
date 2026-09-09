import { tick } from '../../src';

/**
 * Runs a full garbage collection a few times, after letting the microtask queue and pending
 * effects drain (both can hold references from the stack). Requires `--expose-gc`, which
 * `vite.config.ts` passes to the test worker.
 */
export async function collectGarbage(): Promise<void> {
  if (!globalThis.gc)
    throw new Error('tests/memory need --expose-gc (see vite.config.ts execArgv)');
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    tick();
    globalThis.gc();
  }
}

/** Asserts that every WeakRef target has been collected. */
export async function expectCollected(refs: WeakRef<object>[], label = 'objects') {
  await collectGarbage();
  const alive = refs.filter((ref) => ref.deref() !== undefined).length;
  expect(alive, `${alive} of ${refs.length} ${label} still reachable after gc`).toBe(0);
}

/** Asserts that every WeakRef target is still alive (a control for `expectCollected`). */
export async function expectRetained(refs: WeakRef<object>[], label = 'objects') {
  await collectGarbage();
  const collected = refs.filter((ref) => ref.deref() === undefined).length;
  expect(collected, `${collected} of ${refs.length} ${label} were collected`).toBe(0);
}

/** Heap in use after a full collection, in bytes. */
export async function heapUsed(): Promise<number> {
  await collectGarbage();
  return process.memoryUsage().heapUsed;
}
