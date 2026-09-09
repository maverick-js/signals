import { computed, effect, signal, onError, root, tick, type ReadSignal } from '../src';
import { internals } from './utils';

afterEach(() => tick());

it('should store and return value on read', () => {
  const $a = signal(10);
  const $b = signal(10);
  const $c = computed(() => $a.get() + $b.get());

  expect($c.get()).toBe(20);
  tick();

  // Try again to ensure state is maintained.
  expect($c.get()).toBe(20);
});

it('should update when dependency is updated', () => {
  const $a = signal(10);
  const $b = signal(10);
  const $c = computed(() => $a.get() + $b.get());

  $a.set(20);
  expect($c.get()).toBe(30);

  $b.set(20);
  expect($c.get()).toBe(40);
});

it('should update when deep dependency is updated', () => {
  const $a = signal(10);
  const $b = signal(10);
  const $c = computed(() => $a.get() + $b.get());
  const $d = computed(() => $c.get());

  $a.set(20);
  expect($d.get()).toBe(30);
});

it('should update when deep computed dependency is updated', () => {
  const $a = signal(10);
  const $b = signal(10);
  const $c = computed(() => $a.get() + $b.get());
  const $d = computed(() => $c.get());
  const $e = computed(() => $d.get());

  $a.set(20);
  expect($e.get()).toBe(30);
});

it('should only re-compute when needed', () => {
  const compute = vi.fn();

  const $a = signal(10);
  const $b = signal(10);
  const $c = computed(() => compute($a.get() + $b.get()));

  expect(compute).not.toHaveBeenCalled();

  $c.get();
  expect(compute).toHaveBeenCalledTimes(1);
  expect(compute).toHaveBeenCalledWith(20);

  $c.get();
  expect(compute).toHaveBeenCalledTimes(1);

  $a.set(20);
  $c.get();
  expect(compute).toHaveBeenCalledTimes(2);

  $b.set(20);
  $c.get();
  expect(compute).toHaveBeenCalledTimes(3);

  $c.get();
  expect(compute).toHaveBeenCalledTimes(3);
});

it('should only re-compute whats needed', () => {
  const computeC = vi.fn();
  const computeD = vi.fn();

  const $a = signal(10);
  const $b = signal(10);
  const $c = computed(() => {
    const a = $a.get();
    computeC(a);
    return a;
  });
  const $d = computed(() => {
    const b = $b.get();
    computeD(b);
    return b;
  });
  const $e = computed(() => $c.get() + $d.get());

  expect(computeC).not.toHaveBeenCalled();
  expect(computeD).not.toHaveBeenCalled();

  $e.get();
  expect(computeC).toHaveBeenCalledTimes(1);
  expect(computeD).toHaveBeenCalledTimes(1);
  expect($e.get()).toBe(20);

  $a.set(20);
  tick();

  $e.get();
  expect(computeC).toHaveBeenCalledTimes(2);
  expect(computeD).toHaveBeenCalledTimes(1);
  expect($e.get()).toBe(30);

  $b.set(20);
  tick();

  $e.get();
  expect(computeC).toHaveBeenCalledTimes(2);
  expect(computeD).toHaveBeenCalledTimes(2);
  expect($e.get()).toBe(40);
});

it('should discover new dependencies', () => {
  const $a = signal(1);
  const $b = signal(0);

  const $c = computed(() => {
    if ($a.get()) {
      return $a.get();
    } else {
      return $b.get();
    }
  });

  expect($c.get()).toBe(1);

  $a.set(0);
  tick();
  expect($c.get()).toBe(0);

  $b.set(10);
  tick();
  expect($c.get()).toBe(10);
});

it('should accept equals option', () => {
  const $a = signal(0);

  const $b = computed(() => $a.get(), {
    // Treat the next number as equal (skip odd numbers).
    equals: (prev, next) => prev + 1 === next,
  });

  const effectA = vi.fn();
  effect(() => {
    $b.get();
    effectA();
  });

  expect($b.get()).toBe(0);
  expect(effectA).toHaveBeenCalledTimes(1);

  $a.set(2);
  tick();
  expect($b.get()).toBe(2);
  expect(effectA).toHaveBeenCalledTimes(2);

  // no-change
  $a.set(3);
  tick();
  expect($b.get()).toBe(2);
  expect(effectA).toHaveBeenCalledTimes(2);
});

it('should use fallback if error is thrown during init', () => {
  root(() => {
    onError(() => {});

    const $a = computed(
      (): string => {
        throw Error();
      },
      { initial: 'foo' },
    );

    expect($a.get()).toBe('foo');
  });
});

it('should store function values without invoking them', () => {
  const $a = signal(0),
    fnA = () => 'a',
    fnB = () => 'b';

  const $fn = computed(() => ($a.get() === 0 ? fnA : fnB));

  expect($fn.get()).toBe(fnA);

  $a.set(1);
  expect($fn.get()).toBe(fnB);

  $a.set(2);
  expect($fn.get()).toBe(fnB);
});

it('should not notify observers when a function value is unchanged', () => {
  const $a = signal(0),
    fn = () => {};

  const $fn = computed(() => {
    $a.get();
    return fn;
  });

  const spy = vi.fn(() => void $fn.get());
  effect(spy);

  $a.set(1);
  tick();
  expect(spy).toHaveBeenCalledTimes(1);
});

it('should keep the previous value and stay clean after throwing', () => {
  const $a = signal(1);

  const $b = computed(() => {
    if ($a.get() === 2) throw new Error('bad');
    return $a.get() * 10;
  });

  expect($b.get()).toBe(10);

  $a.set(2);
  expect(() => $b.get()).toThrow('bad');
  expect($b.get()).toBe(10);

  $a.set(3);
  expect($b.get()).toBe(30);
});

it('should keep tracking dependencies read before an error', () => {
  const $a = signal(1),
    $b = signal(1),
    spy = vi.fn();

  const $c = computed(() => {
    spy();
    const a = $a.get();
    if (a === 2) throw new Error('bad');
    return a + $b.get();
  });

  expect($c.get()).toBe(2);

  $a.set(2);
  expect(() => $c.get()).toThrow('bad');
  expect(spy).toHaveBeenCalledTimes(2);

  // `$b` was not read during the failed run so it is no longer a dependency.
  $b.set(5);
  expect($c.get()).toBe(2);
  expect(spy).toHaveBeenCalledTimes(2);

  $a.set(3);
  expect($c.get()).toBe(8);
  expect(spy).toHaveBeenCalledTimes(3);
});

it('should not recompute when a dependency is set to the same value', () => {
  const spy = vi.fn(),
    $a = signal(1);

  const $b = computed(() => {
    spy();
    return $a.get();
  });

  expect($b.get()).toBe(1);
  $a.set(1);
  expect($b.get()).toBe(1);
  expect(spy).toHaveBeenCalledTimes(1);
});

it('should recompute only once after multiple writes', () => {
  const spy = vi.fn(),
    $a = signal(1);

  const $b = computed(() => {
    spy();
    return $a.get();
  });

  $b.get();
  $a.set(2);
  $a.set(3);
  $a.set(4);
  expect($b.get()).toBe(4);
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should not recompute an unobserved computed until it is read', () => {
  const spy = vi.fn(),
    $a = signal(1);

  const $b = computed(() => {
    spy();
    return $a.get();
  });

  $b.get();
  $a.set(2);
  tick();
  expect(spy).toHaveBeenCalledTimes(1);
  $b.get();
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should compute with an object initial value that is later replaced', () => {
  const $a = signal<{ v: number } | null>(null);

  const $b = computed(() => $a.get()?.v ?? -1, { initial: 100 });

  expect($b.get()).toBe(-1);
  $a.set({ v: 5 });
  expect($b.get()).toBe(5);
});

it('should use a dev id derived from the kind of computation', () => {
  const $a = signal(0),
    $b = computed(() => 0),
    $c = computed(() => 0, { id: 'c' });

  expect(internals($a).id).toBe('signal');
  expect(internals($b).id).toBe('computed');
  expect(internals($c).id).toBe('c');
});

it('should not notify observers when a recomputed value is Object.is-equal', () => {
  const $a = signal(1),
    $nan = computed(() => ($a.get(), NaN)),
    spy = vi.fn(() => void $nan.get());

  effect(spy);
  $a.set(2);
  tick();
  expect(spy).toHaveBeenCalledTimes(1);
});

it('should throw on a self-referencing computed', () => {
  const $a = signal(1);

  let $c!: ReadSignal<number>;
  $c = computed(() => $a.get() + ($c ? $c.get() : 0));

  expect(() => $c.get()).toThrow(/cycle/i);

  // The graph is left in a usable state.
  $a.set(2);
  expect(() => $c.get()).toThrow(/cycle/i);
});

it('should throw on a mutual dependency cycle', () => {
  const $a = signal(1);

  let $b!: ReadSignal<number>, $c!: ReadSignal<number>;
  $b = computed(() => $a.get() + ($c ? $c.get() : 0));
  $c = computed(() => $b.get() * 2);

  expect(() => $c.get()).toThrow(/cycle/i);

  // Like any other error, the failed computeds keep their previous value and are marked clean, so
  // the cycle is reported again once a dependency changes.
  $a.set(2);
  expect(() => $b.get()).toThrow(/cycle/i);
});

it('should route a cycle error to onError like any other error', () => {
  const handler = vi.fn();

  root(() => {
    onError(handler);
    let $c!: ReadSignal<number>;
    $c = computed(() => ($c ? $c.get() : 0) + 1, { initial: -1 });
    expect($c.get()).toBe(-1);
  });

  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler.mock.calls[0][0].message).toMatch(/cycle/i);
});

it('should not report a cycle for a computed that is read again after it finished', () => {
  const $a = signal(1),
    $b = computed(() => $a.get() * 2),
    $c = computed(() => $b.get() + $b.get());

  expect($c.get()).toBe(4);
  $a.set(2);
  expect($c.get()).toBe(8);
});
