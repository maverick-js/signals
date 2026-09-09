import { SCOPE, computed, effect, getScope, root, signal, tick, type Scope } from '../../src';
import { computedKeyedMap, computedMap } from '../../src/map';
import { internals } from '../utils';
import { expectCollected, expectRetained } from './helpers';

const range = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => offset + i);

afterEach(() => tick());

it('should release the previous generation of nested computations on every effect re-run', async () => {
  const $a = signal(0),
    $b = signal(0),
    generations: WeakRef<object>[][] = [];

  const dispose = root((dispose) => {
    effect(() => {
      $a.get();
      const refs: WeakRef<object>[] = [];
      const $c = computed(() => $b.get() + 1);
      refs.push(new WeakRef($c));
      effect(() => {
        refs.push(new WeakRef(getScope()!));
        $c.get();
      });
      generations.push(refs);
    });
    return dispose;
  });

  for (let i = 1; i <= 50; i++) {
    $a.set(i);
    tick();
  }

  expect(generations).toHaveLength(51);
  await expectCollected(generations.slice(0, -1).flat(), 'stale nested computations');
  await expectRetained(generations.at(-1)!, 'current nested computations');

  dispose();
});

it('should release removed computedMap items across grow/shrink cycles and keep the scope compact', async () => {
  const $items = signal<number[]>([]),
    // Item nodes are keyed by index; remember the value each node was created with.
    created = new Map<number, WeakRef<object>>();

  let mapScope!: Scope;

  const dispose = root((dispose) => {
    const map = computedMap($items, ($item, index) => {
      const node = getScope()!;
      mapScope = node[SCOPE]!;
      created.set($item.peek(), new WeakRef(node));
      effect(() => void $item.get());
      return index;
    });
    effect(() => void map.get());
    return dispose;
  });

  for (let cycle = 0; cycle < 30; cycle++) {
    $items.set(range(200, cycle * 1000));
    tick();
    $items.set(range(50, cycle * 1000));
    tick();
  }

  // Indices 0..49 were created once (cycle 0) and only received new values since; every node
  // created for an index >= 50 has been disposed by a shrink.
  const removed = [...created].filter(([value]) => value % 1000 >= 50).map(([, ref]) => ref),
    kept = [...created].filter(([value]) => value % 1000 < 50).map(([, ref]) => ref);

  expect(removed).toHaveLength(150 * 30);
  expect(kept).toHaveLength(50);
  expect(mapScope._children).toHaveLength(50);

  await expectCollected(removed, 'removed computedMap items');
  await expectRetained(kept, 'live computedMap items');

  dispose();
});

it('should release removed computedKeyedMap items while the map lives on', async () => {
  const make = (n: number) => range(n).map((id) => ({ id }));
  const $rows = signal(make(200)),
    tracked = new Map<number, WeakRef<object>>();

  let mapScope!: Scope;

  const dispose = root((dispose) => {
    const map = computedKeyedMap($rows, (row, $index) => {
      const node = getScope()!;
      mapScope = node[SCOPE]!;
      tracked.set(row.id, new WeakRef(node));
      effect(() => void $index.get());
      return row.id;
    });
    effect(() => void map.get());
    return dispose;
  });

  $rows.set($rows.get().filter((row) => row.id % 4 === 0));
  tick();

  const removed = [...tracked].filter(([id]) => id % 4 !== 0).map(([, ref]) => ref),
    kept = [...tracked].filter(([id]) => id % 4 === 0).map(([, ref]) => ref);

  expect(removed).toHaveLength(150);
  expect(mapScope._children).toHaveLength(50);

  await expectCollected(removed, 'removed computedKeyedMap items');
  await expectRetained(kept, 'live computedKeyedMap items');

  dispose();
});

it('should drop a dependency edge when a computed stops reading a source', () => {
  const $cond = signal(true),
    $a = signal(1),
    $b = signal(2);

  const $c = computed(() => ($cond.get() ? $a.get() : $b.get()));
  $c.get();
  expect(internals($a)._observers).toHaveLength(1);

  $cond.set(false);
  $c.get();
  expect(internals($a)._observers).toHaveLength(0);
  expect(internals($b)._observers).toHaveLength(1);

  for (let i = 0; i < 100; i++) {
    $cond.set(i % 2 === 0);
    $c.get();
  }
  expect(internals($a)._observers!.length + internals($b)._observers!.length).toBe(1);
});

it('should not retain effects in the scheduler queue after a flush', async () => {
  const $a = signal(0),
    refs: WeakRef<object>[] = [];

  for (let i = 0; i < 100; i++) {
    const dispose = root((dispose) => {
      effect(() => {
        refs.push(new WeakRef(getScope()!));
        $a.get();
      });
      return dispose;
    });
    $a.set(i + 1); // queues the effect
    dispose(); // ...then disposes it before the flush
    tick();
  }

  await expectCollected(refs, 'effects that were queued then disposed');
});
