// https://github.com/preactjs/signals/blob/main/packages/core/test/signal.test.tsx#L1249

import { computed, signal, tick, effect, root, type ReadSignal } from '../src';
import { internals } from './utils';

it('should drop A->B->A updates', () => {
  //     A
  //   / |
  //  B  | <- Looks like a flag doesn't it? :D
  //   \ |
  //     C
  //     |
  //     D

  const $a = signal(2);
  const $b = computed(() => $a.get() - 1);
  const $c = computed(() => $a.get() + $b.get());

  const compute = vi.fn(() => 'd: ' + $c.get());
  const $d = computed(compute);

  expect($d.get()).toBe('d: 3');
  expect(compute).toHaveBeenCalledTimes(1);
  compute.mockReset();

  $a.set(4);
  $d.get();
  tick();
  expect(compute).toHaveBeenCalledTimes(1);
});

it('should only update every signal once (diamond graph)', () => {
  // In this scenario "D" should only update once when "A" receives
  // an update. This is sometimes referred to as the "diamond" scenario.
  //     A
  //   /   \
  //  B     C
  //   \   /
  //     D

  const $a = signal('a');
  const $b = computed(() => $a.get());
  const $c = computed(() => $a.get());

  const spy = vi.fn(() => $b.get() + ' ' + $c.get());
  const $d = computed(spy);

  expect($d.get()).toBe('a a');
  expect(spy).toHaveBeenCalledTimes(1);

  $a.set('aa');
  tick();
  expect($d.get()).toBe('aa aa');
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should only update every signal once (diamond graph + tail)', () => {
  // "E" will be likely updated twice if our mark+sweep logic is buggy.
  //     A
  //   /   \
  //  B     C
  //   \   /
  //     D
  //     |
  //     E

  const $a = signal('a');
  const $b = computed(() => $a.get());
  const $c = computed(() => $a.get());
  const $d = computed(() => $b.get() + ' ' + $c.get());

  const spy = vi.fn(() => $d.get());
  const $e = computed(spy);

  expect($e.get()).toBe('a a');
  expect(spy).toHaveBeenCalledTimes(1);

  $a.set('aa');
  tick();
  expect($e.get()).toBe('aa aa');
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should bail out if result is the same', () => {
  // Bail out if value of "B" never changes
  // A->B->C

  const $a = signal('a');

  const $b = computed(() => {
    $a.get();
    return 'foo';
  });

  const spy = vi.fn(() => $b.get());
  const $c = computed(spy);

  expect($c.get()).toBe('foo');
  expect(spy).toHaveBeenCalledTimes(1);

  $a.set('aa');
  tick();
  expect($c.get()).toBe('foo');
  expect(spy).toHaveBeenCalledTimes(1);
});

it('should only update every signal once (jagged diamond graph + tails)', () => {
  // "F" and "G" will be likely updated >3 if our mark+sweep logic is buggy.
  //     A
  //   /   \
  //  B     C
  //  |     |
  //  |     D
  //   \   /
  //     E
  //   /   \
  //  F     G

  const $a = signal('a', { id: '$a' });
  const $b = computed(() => $a.get(), { id: '$b' });
  const $c = computed(() => $a.get(), { id: '$c' });
  const $d = computed(() => $c.get(), { id: '$d' });

  const eSpy = vi.fn(() => $b.get() + ' ' + $d.get());
  const $e = computed(eSpy, { id: '$e' });

  const fSpy = vi.fn(() => $e.get());
  const $f = computed(fSpy, { id: '$f' });
  const gSpy = vi.fn(() => $e.get());
  const $g = computed(gSpy, { id: '$g' });

  expect($f.get()).toBe('a a');
  expect(fSpy).toHaveBeenCalledTimes(1);

  expect($g.get()).toBe('a a');
  expect(gSpy).toHaveBeenCalledTimes(1);

  $a.set('b');
  tick();

  expect($e.get()).toBe('b b');
  expect(eSpy).toHaveBeenCalledTimes(2);

  expect($f.get()).toBe('b b');
  expect(fSpy).toHaveBeenCalledTimes(2);

  expect($g.get()).toBe('b b');
  expect(gSpy).toHaveBeenCalledTimes(2);

  $a.set('c');
  tick();

  expect($e.get()).toBe('c c');
  expect(eSpy).toHaveBeenCalledTimes(3);

  expect($f.get()).toBe('c c');
  expect(fSpy).toHaveBeenCalledTimes(3);

  expect($g.get()).toBe('c c');
  expect(gSpy).toHaveBeenCalledTimes(3);
});

it('should only subscribe to signals listened to', () => {
  //    *A
  //   /   \
  // *B     C <- we don't listen to C

  const $a = signal('a');

  const $b = computed(() => $a.get());
  const spy = vi.fn(() => $a.get());
  computed(spy);

  expect($b.get()).toBe('a');
  expect(spy).toBeCalledTimes(0);

  $a.set('aa');
  tick();

  expect($b.get()).toBe('aa');
  expect(spy).toBeCalledTimes(0);
});

it('should ensure subs update even if one dep unmarks it', () => {
  // In this scenario "C" always returns the same value. When "A"
  // changes, "B" will update, then "C" at which point its update
  // to "D" will be unmarked. But "D" must still update because
  // "B" marked it. If "D" isn't updated, then we have a bug.
  //     A
  //   /   \
  //  B     *C <- returns same value every time
  //   \   /
  //     D

  const $a = signal('a');
  const $b = computed(() => $a.get());
  const $c = computed(() => {
    $a.get();
    return 'c';
  });

  const spy = vi.fn(() => $b.get() + ' ' + $c.get());
  const $d = computed(spy);

  expect($d.get()).toBe('a c');

  $a.set('aa');
  tick();

  expect($d.get()).toBe('aa c');
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should ensure subs update even if two deps unmark it', () => {
  // In this scenario both "C" and "D" always return the same
  // value. But "E" must still update because "A"  marked it.
  // If "E" isn't updated, then we have a bug.
  //     A
  //   / | \
  //  B *C *D
  //   \ | /
  //     E

  const $a = signal('a');
  const $b = computed(() => $a.get());
  const $c = computed(() => {
    $a.get();
    return 'c';
  });
  const $d = computed(() => {
    $a.get();
    return 'd';
  });

  const spy = vi.fn(() => $b.get() + ' ' + $c.get() + ' ' + $d.get());
  const $e = computed(spy);
  expect($e.get()).toBe('a c d');

  $a.set('aa');
  tick();

  expect($e.get()).toBe('aa c d');
  expect(spy).toHaveBeenCalledTimes(2);
});

// ---------------------------------------------------------------------------------------------
// Dynamic dependencies
// ---------------------------------------------------------------------------------------------

it('should track dependencies read in a different order', () => {
  const $a = signal(1),
    $b = signal(2),
    $order = signal(true);

  const spy = vi.fn(() => ($order.get() ? $a.get() + $b.get() : $b.get() + $a.get()));
  const $c = computed(spy);

  expect($c.get()).toBe(3);

  $order.set(false);
  expect($c.get()).toBe(3);
  expect(spy).toHaveBeenCalledTimes(2);

  $a.set(10);
  expect($c.get()).toBe(12);
  expect(spy).toHaveBeenCalledTimes(3);

  $b.set(20);
  expect($c.get()).toBe(30);
  expect(spy).toHaveBeenCalledTimes(4);

  expect(internals($a)._observers).toHaveLength(1);
  expect(internals($b)._observers).toHaveLength(1);
  expect(internals($c)._sources).toHaveLength(3);
});

it('should unsubscribe from dependencies that are no longer read', () => {
  const $cond = signal(true),
    $a = signal(1),
    $b = signal(2);

  const $c = computed(() => ($cond.get() ? $a.get() : $b.get()));

  expect($c.get()).toBe(1);
  expect(internals($a)._observers).toHaveLength(1);
  expect(internals($b)._observers).toBeNull();

  $cond.set(false);
  expect($c.get()).toBe(2);
  expect(internals($a)._observers).toHaveLength(0);
  expect(internals($b)._observers).toHaveLength(1);

  $a.set(100);
  expect($c.get()).toBe(2);
});

it('should become constant when the last dependency is dropped', () => {
  const $cond = signal(true),
    $a = signal(1),
    spy = vi.fn(() => ($cond.get() ? $a.get() : 0));

  const $c = computed(spy);
  const $stop = signal(false);
  void $stop;

  expect($c.get()).toBe(1);

  $cond.set(false);
  expect($c.get()).toBe(0);
  expect(spy).toHaveBeenCalledTimes(2);
  expect(internals($a)._observers).toHaveLength(0);

  $a.set(2);
  expect($c.get()).toBe(0);
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should handle an effect that switches between two computeds', () => {
  const $cond = signal(true),
    $a = signal(1),
    $b = signal(10),
    $c = computed(() => $a.get() * 2),
    $d = computed(() => $b.get() * 2),
    spy = vi.fn();

  effect(() => {
    spy($cond.get() ? $c.get() : $d.get());
  });

  expect(spy).toHaveBeenLastCalledWith(2);

  $b.set(20);
  tick();
  expect(spy).toHaveBeenCalledTimes(1);

  $cond.set(false);
  tick();
  expect(spy).toHaveBeenLastCalledWith(40);
  expect(spy).toHaveBeenCalledTimes(2);

  $a.set(5);
  tick();
  expect(spy).toHaveBeenCalledTimes(2);
  expect(internals($c)._observers).toHaveLength(0);
});

it('should grow and shrink dependencies across runs', () => {
  const $n = signal(1),
    signals = Array.from({ length: 5 }, (_, i) => signal(i));

  const $sum = computed(() => {
    const n = $n.get();
    let sum = 0;
    for (let i = 0; i < n; i++) sum += signals[i].get();
    return sum;
  });

  expect($sum.get()).toBe(0);
  expect(internals($sum)._sources).toHaveLength(2);

  $n.set(5);
  expect($sum.get()).toBe(10);
  expect(internals($sum)._sources).toHaveLength(6);
  for (const $s of signals) expect(internals($s)._observers).toHaveLength(1);

  $n.set(2);
  expect($sum.get()).toBe(1);
  expect(internals($sum)._sources).toHaveLength(3);
  expect(internals(signals[4])._observers).toHaveLength(0);

  signals[4].set(100);
  expect($sum.get()).toBe(1);
});

it('should keep edges for sources re-read after a divergence', () => {
  const $toggle = signal(false),
    $a = signal(1),
    $b = signal(2),
    stable = Array.from({ length: 5 }, (_, i) => signal(i));

  const $c = computed(() => {
    let total = $toggle.get() ? $a.get() : $b.get();
    for (const $s of stable) total += $s.get();
    return total;
  });

  expect($c.get()).toBe(2 + 10);
  const observersBefore = stable.map(($s) => internals($s)._observers);

  $toggle.set(true);
  expect($c.get()).toBe(1 + 10);

  // Same edge arrays, no unsubscribe/resubscribe of the stable suffix.
  stable.forEach(($s, i) => {
    expect(internals($s)._observers).toBe(observersBefore[i]);
    expect(internals($s)._observers).toHaveLength(1);
  });
  expect(internals($a)._observers).toHaveLength(1);
  expect(internals($b)._observers).toHaveLength(0);
  expect(internals($c)._sources).toEqual([$toggle, $a, ...stable.map(($s) => $s)]);

  stable[3].set(100);
  expect($c.get()).toBe(1 + 10 - 3 + 100);
});

it('should preserve duplicate edge counts across divergent runs', () => {
  const $toggle = signal(false),
    $a = signal(1),
    $b = signal(2),
    $c = signal(3);

  const $d = computed(() => ($toggle.get() ? $a.get() : $b.get()) + $c.get() + $c.get());

  expect($d.get()).toBe(2 + 6);
  expect(internals($c)._observers).toHaveLength(2);

  $toggle.set(true);
  expect($d.get()).toBe(1 + 6);
  expect(internals($c)._observers).toHaveLength(2);
  expect(internals($d)._sources).toEqual([$toggle, $a, $c, $c]);

  $c.set(10);
  expect($d.get()).toBe(21);

  $toggle.set(false);
  expect($d.get()).toBe(22);
  expect(internals($c)._observers).toHaveLength(2);
  expect(internals($a)._observers).toHaveLength(0);
});

it('should handle a source moving between prefix and suffix across runs', () => {
  const $order = signal(true),
    $a = signal(1),
    $b = signal(2);

  const $c = computed(() =>
    $order.get() ? $a.get() + $b.get() + $a.get() : $b.get() + $a.get() + $a.get(),
  );

  expect($c.get()).toBe(4);
  expect(internals($a)._observers).toHaveLength(2);
  expect(internals($b)._observers).toHaveLength(1);

  $order.set(false);
  expect($c.get()).toBe(4);
  expect(internals($a)._observers).toHaveLength(2);
  expect(internals($b)._observers).toHaveLength(1);

  $a.set(5);
  expect($c.get()).toBe(12);
  $b.set(0);
  expect($c.get()).toBe(10);
});

// ---------------------------------------------------------------------------------------------
// Repeated reads
// ---------------------------------------------------------------------------------------------

it('should run an effect once when the same signal is read multiple times', () => {
  const $a = signal(0),
    spy = vi.fn();

  effect(() => {
    $a.get();
    $a.get();
    $a.get();
    spy();
  });

  $a.set(1);
  tick();
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should recompute once when the same computed is read multiple times', () => {
  const $a = signal(0),
    computeB = vi.fn(() => $a.get() + 1),
    $b = computed(computeB),
    spy = vi.fn(() => $b.get() + $b.get() + $b.get());

  const $c = computed(spy);

  expect($c.get()).toBe(3);
  $a.set(1);
  expect($c.get()).toBe(6);
  expect(computeB).toHaveBeenCalledTimes(2);
  expect(spy).toHaveBeenCalledTimes(2);
});

// ---------------------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------------------

it('should recompute each node once in a deep chain', () => {
  const $a = signal(0),
    spies: ReturnType<typeof vi.fn>[] = [];

  let $prev = $a as ReadSignal<number>;
  for (let i = 0; i < 100; i++) {
    const $source = $prev,
      spy = vi.fn(() => $source.get() + 1);
    spies.push(spy);
    $prev = computed(spy);
  }

  expect($prev.get()).toBe(100);

  $a.set(1);
  expect($prev.get()).toBe(101);

  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(2);
});

it('should handle wide fan-out into a single effect', () => {
  const $a = signal(1),
    computeds = Array.from({ length: 100 }, (_, i) => computed(() => $a.get() * i)),
    spy = vi.fn();

  effect(() => {
    spy(computeds.reduce((sum, $c) => sum + $c.get(), 0));
  });

  expect(spy).toHaveBeenLastCalledWith(4950);

  $a.set(2);
  tick();
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy).toHaveBeenLastCalledWith(9900);
});

it('should handle fan-in from many signals', () => {
  const signals = Array.from({ length: 100 }, (_, i) => signal(i)),
    spy = vi.fn(() => signals.reduce((sum, $s) => sum + $s.get(), 0)),
    $sum = computed(spy);

  expect($sum.get()).toBe(4950);

  signals[50].set(0);
  expect($sum.get()).toBe(4900);
  expect(spy).toHaveBeenCalledTimes(2);

  for (const $s of signals) $s.set(1);
  expect($sum.get()).toBe(100);
  expect(spy).toHaveBeenCalledTimes(3);
});

it('should run an effect once when many dependencies change in the same tick', () => {
  const signals = Array.from({ length: 50 }, (_, i) => signal(i)),
    spy = vi.fn();

  effect(() => {
    spy(signals.reduce((sum, $s) => sum + $s.get(), 0));
  });

  for (const $s of signals) $s.set(1);
  tick();
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy).toHaveBeenLastCalledWith(50);
});

it('should bail out along a chain when an intermediate value does not change', () => {
  const $a = signal(1),
    $b = computed(() => ($a.get() > 0 ? 'pos' : 'neg')),
    computeC = vi.fn(() => $b.get() + '!'),
    $c = computed(computeC),
    spy = vi.fn();

  effect(() => {
    spy($c.get());
  });

  $a.set(2);
  tick();
  expect(computeC).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledTimes(1);

  $a.set(-1);
  tick();
  expect(computeC).toHaveBeenCalledTimes(2);
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy).toHaveBeenLastCalledWith('neg!');
});

it('should not glitch: effects see consistent derived values', () => {
  const $a = signal(1),
    $b = computed(() => $a.get() * 2),
    $c = computed(() => $a.get() * 3),
    $d = computed(() => $b.get() + $c.get()),
    seen: number[][] = [];

  effect(() => {
    seen.push([$a.get(), $b.get(), $c.get(), $d.get()]);
  });

  $a.set(2);
  tick();
  $a.set(3);
  tick();

  expect(seen).toEqual([
    [1, 2, 3, 5],
    [2, 4, 6, 10],
    [3, 6, 9, 15],
  ]);
});

it('should not glitch when an effect reads a signal and a computed derived from it', () => {
  const $a = signal(1),
    $b = computed(() => $a.get() + 1),
    seen: string[] = [];

  effect(() => {
    seen.push(`${$b.get()}-${$a.get()}`);
  });

  effect(() => {
    seen.push(`${$a.get()}-${$b.get()}`);
  });

  $a.set(5);
  tick();
  expect(seen).toEqual(['2-1', '1-2', '6-5', '5-6']);
});

it('should handle a computed depending on a computed that depends on the same signal', () => {
  const $a = signal(1),
    $b = computed(() => $a.get() + 1),
    computeC = vi.fn(() => $a.get() + $b.get()),
    $c = computed(computeC);

  expect($c.get()).toBe(3);
  $a.set(2);
  expect($c.get()).toBe(5);
  expect(computeC).toHaveBeenCalledTimes(2);
});

it('should handle a jagged graph where a leaf is both direct and indirect dependent', () => {
  //     A
  //   / | \
  //  B  |  C
  //  |  |  |
  //  D  |  E
  //   \ | /
  //     F
  const $a = signal(1),
    $b = computed(() => $a.get() + 1),
    $c = computed(() => $a.get() + 2),
    $d = computed(() => $b.get() * 2),
    $e = computed(() => $c.get() * 2),
    computeF = vi.fn(() => $d.get() + $a.get() + $e.get()),
    $f = computed(computeF);

  expect($f.get()).toBe(4 + 1 + 6);

  $a.set(2);
  tick();
  expect($f.get()).toBe(6 + 2 + 8);
  expect(computeF).toHaveBeenCalledTimes(2);
});

// ---------------------------------------------------------------------------------------------
// Effects and ordering
// ---------------------------------------------------------------------------------------------

it('should run sibling effects in creation order', () => {
  const $a = signal(0),
    order: string[] = [];

  effect(() => {
    $a.get();
    order.push('a');
  });

  effect(() => {
    $a.get();
    order.push('b');
  });

  effect(() => {
    $a.get();
    order.push('c');
  });

  order.length = 0;
  $a.set(1);
  tick();
  expect(order).toEqual(['a', 'b', 'c']);
});

it('should run parent before child and dispose the stale child when both are dirty', () => {
  const $a = signal(0),
    order: string[] = [];

  effect(() => {
    $a.get();
    order.push('parent');
    effect(() => {
      $a.get();
      order.push('child');
    });
  });

  order.length = 0;
  $a.set(1);
  tick();
  expect(order).toEqual(['parent', 'child']);
});

it('should recreate nested computeds on each parent run', () => {
  const $a = signal(0),
    $b = signal(0),
    created = vi.fn(),
    spy = vi.fn();

  effect(() => {
    $a.get();
    created();
    const $c = computed(() => $b.get() + 1);
    spy($c.get());
  });

  expect(created).toHaveBeenCalledTimes(1);

  $b.set(1);
  tick();
  expect(created).toHaveBeenCalledTimes(2);
  expect(spy).toHaveBeenLastCalledWith(2);

  $a.set(1);
  tick();
  expect(created).toHaveBeenCalledTimes(3);
});

it('should see writes from an earlier sibling effect in the same flush', () => {
  const $a = signal(0),
    $b = signal(0),
    spy = vi.fn();

  effect(() => {
    $b.set($a.get() * 2);
  });

  effect(() => {
    spy($b.get());
  });

  $a.set(5);
  tick();
  expect(spy).toHaveBeenLastCalledWith(10);
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should see writes from a later sibling effect in the same flush', () => {
  const $a = signal(0),
    $b = signal(0),
    spy = vi.fn();

  effect(() => {
    spy($b.get());
  });

  effect(() => {
    $b.set($a.get() * 2);
  });

  $a.set(5);
  tick();
  expect(spy).toHaveBeenLastCalledWith(10);
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should ignore a write to its own dependency during the run', () => {
  const $a = signal(0),
    spy = vi.fn();

  effect(() => {
    spy($a.get());
    if ($a.get() < 3) $a.set($a.get() + 1);
  });

  tick();
  expect($a.get()).toBe(1);
  expect(spy).toHaveBeenCalledTimes(1);

  $a.set(2);
  tick();
  expect($a.get()).toBe(3);
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should read the latest value of a disposed computed without tracking it', () => {
  const $s = signal(1),
    spy = vi.fn();

  let $c!: ReadSignal<number>;

  const dispose = root((dispose) => {
    $c = computed(() => $s.get() * 10);
    return dispose;
  });

  effect(() => {
    spy($c.get());
  });

  expect(spy).toHaveBeenLastCalledWith(10);
  dispose();

  $s.set(2);
  tick();
  expect(spy).toHaveBeenCalledTimes(1);
  expect($c.get()).toBe(10);
});

it('should keep observers of a root-level signal working after an inner root is disposed', () => {
  const $a = signal(0),
    outer = vi.fn(),
    inner = vi.fn();

  effect(() => outer($a.get()));

  const dispose = root((dispose) => {
    effect(() => inner($a.get()));
    return dispose;
  });

  dispose();

  $a.set(1);
  tick();
  expect(outer).toHaveBeenCalledTimes(2);
  expect(inner).toHaveBeenCalledTimes(1);
});

it('should handle many independent roots', () => {
  const $a = signal(0),
    spies = Array.from({ length: 20 }, () => vi.fn()),
    disposers = spies.map((spy) =>
      root((dispose) => {
        effect(() => spy($a.get()));
        return dispose;
      }),
    );

  $a.set(1);
  tick();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(2);

  disposers.filter((_, i) => i % 2 === 0).forEach((dispose) => dispose());

  $a.set(2);
  tick();
  spies.forEach((spy, i) => expect(spy).toHaveBeenCalledTimes(i % 2 === 0 ? 2 : 3));
  expect(internals($a)._observers).toHaveLength(10);
});

// ---------------------------------------------------------------------------------------------
// Fuzz: random graphs against a naive model
// ---------------------------------------------------------------------------------------------

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FuzzNode {
  deps: number[];
  optional: number; // extra dependency read only when the first dep is odd.
  read(): number;
}

it('should match a naive model on random graphs', () => {
  const rng = mulberry32(1234);

  for (let round = 0; round < 25; round++) {
    const signalCount = 3 + Math.floor(rng() * 8),
      computedCount = 10 + Math.floor(rng() * 40),
      values = Array.from({ length: signalCount }, (_, i) => i),
      signals = values.map((v) => signal(v)),
      nodes: FuzzNode[] = signals.map((s) => ({ deps: [], optional: -1, read: () => s.get() })),
      computeCounts = new Array(signalCount + computedCount).fill(0);

    for (let i = signalCount; i < signalCount + computedCount; i++) {
      const depCount = 1 + Math.floor(rng() * 3),
        deps = Array.from({ length: depCount }, () => Math.floor(rng() * i)),
        optional = rng() < 0.5 ? Math.floor(rng() * i) : -1,
        index = i;

      const $c = computed(() => {
        computeCounts[index]++;
        let sum = 0;
        for (const dep of deps) sum += nodes[dep].read();
        if (optional !== -1 && nodes[deps[0]].read() % 2 === 1) sum += nodes[optional].read();
        return sum;
      });

      nodes.push({ deps, optional, read: () => $c.get() });
    }

    // Naive model: recompute everything from scratch each time.
    const model = (i: number, memo: Map<number, number>): number => {
      if (i < signalCount) return values[i];
      if (memo.has(i)) return memo.get(i)!;
      const node = nodes[i];
      let sum = 0;
      for (const dep of node.deps) sum += model(dep, memo);
      if (node.optional !== -1 && model(node.deps[0], memo) % 2 === 1) {
        sum += model(node.optional, memo);
      }
      memo.set(i, sum);
      return sum;
    };

    const leaves = nodes.slice(-5),
      seen: number[][] = [];

    const dispose = root((dispose) => {
      effect(() => {
        seen.push(leaves.map((leaf) => leaf.read()));
      });
      return dispose;
    });

    for (let step = 0; step < 30; step++) {
      const writes = 1 + Math.floor(rng() * 3);
      for (let w = 0; w < writes; w++) {
        const i = Math.floor(rng() * signalCount),
          v = Math.floor(rng() * 20);
        values[i] = v;
        signals[i].set(v);
      }

      const memo = new Map<number, number>();

      // Reading directly (pull).
      const readCount = Math.floor(rng() * nodes.length);
      for (let r = 0; r < readCount; r++) {
        const i = Math.floor(rng() * nodes.length);
        expect(nodes[i].read()).toBe(model(i, memo));
      }

      // Flushing effects (push) - the effect must observe the same consistent snapshot.
      const before = computeCounts.slice();
      tick();
      expect(seen[seen.length - 1]).toEqual(
        leaves.map((_, l) => model(nodes.length - 5 + l, memo)),
      );

      // No computation should have run more than once during the flush.
      for (let i = 0; i < computeCounts.length; i++) {
        expect(computeCounts[i] - before[i]).toBeLessThanOrEqual(1);
      }
    }

    dispose();
  }
});
