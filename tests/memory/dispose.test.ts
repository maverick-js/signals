import {
  computed,
  createScope,
  effect,
  getScope,
  onDispose,
  onError,
  root,
  signal,
  tick,
  type Scope,
} from '../../src';
import { computedKeyedMap, computedMap } from '../../src/map';
import { expectCollected, expectRetained } from './helpers';

afterEach(() => tick());

it('should release every node created inside a root once it is disposed', async () => {
  // Sources outlive the root so they can't be what makes the nodes collectable.
  const $a = signal(1),
    $list = signal([{ id: 1 }, { id: 2 }, { id: 3 }]),
    $items = signal([1, 2, 3]);

  const refs: WeakRef<object>[] = [];
  const track = (node: object) => refs.push(new WeakRef(node));

  // `let` so the disposer (a function bound to the root scope) can be dropped before collecting.
  let dispose: (() => void) | undefined = root((dispose) => {
    track(getScope()!);
    onError(() => {});
    onDispose(() => {});

    const $c = computed(() => $a.get() * 2);
    track($c);

    effect(() => {
      track(getScope()!);
      $c.get();
      const $inner = computed(() => $a.get() + 1);
      track($inner);
      $inner.get();
      effect(() => {
        track(getScope()!);
        $inner.get();
      });
    });

    root(() => {
      track(getScope()!);
      effect(() => {
        track(getScope()!);
        $a.get();
      });
    });

    const keyed = computedKeyedMap($list, (item, $index) => {
      track(getScope()!);
      track($index);
      effect(() => {
        track(getScope()!);
        $index.get();
      });
      return item;
    });
    keyed.get();

    const mapped = computedMap($items, ($item) => {
      track(getScope()!);
      track($item);
      effect(() => {
        track(getScope()!);
        $item.get();
      });
      return $item;
    });
    mapped.get();

    return dispose;
  });

  expect(refs.length).toBeGreaterThan(20);
  await expectRetained(refs, 'nodes of a live root');

  dispose();
  dispose = undefined;
  await expectCollected(refs, 'nodes of a disposed root');

  // The sources are untouched and still usable.
  $a.set(2);
  expect($a.get()).toBe(2);
});

it('should not let a disposed effect keep its cleanup closure alive', async () => {
  const $a = signal(0),
    refs: WeakRef<object>[] = [];

  const stop = effect(() => {
    $a.get();
    const captured = { big: new Array(1000).fill(0) };
    refs.push(new WeakRef(captured));
    return () => captured.big.length;
  });

  stop();
  await expectCollected(refs, 'effect cleanup closures');
});

it('should not leave a disposed observer in any source observer list', async () => {
  const sources = Array.from({ length: 20 }, (_, i) => signal(i)),
    refs: WeakRef<object>[] = [];

  const dispose = root((dispose) => {
    for (let i = 0; i < 50; i++) {
      const $c = computed(() => sources.reduce((sum, $s) => sum + $s.get(), 0) + i);
      refs.push(new WeakRef($c));
      effect(() => {
        refs.push(new WeakRef(getScope()!));
        $c.get();
      });
    }
    return dispose;
  });

  dispose();
  await expectCollected(refs, 'observers of long-lived sources');
});

it('should release appended scopes when the parent is disposed', async () => {
  const parent = createScope();

  // Built in a helper so no local binding keeps the child alive during collection.
  const ref = (() => {
    const child = createScope();
    parent.append(child);
    return new WeakRef<Scope>(child);
  })();

  parent.dispose();
  await expectCollected([ref], 'appended child scope');
});
