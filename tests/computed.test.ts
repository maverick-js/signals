import { computed, effect, signal, onError, root, tick } from '../src';

afterEach(() => tick());

it('should store and return value on read', () => {
  const $a = signal(10);
  const $b = signal(10);
  const $c = computed(() => $a() + $b());

  expect($c()).toBe(20);
  tick();

  // Try again to ensure state is maintained.
  expect($c()).toBe(20);
});

it('should update when dependency is updated', () => {
  const $a = signal(10);
  const $b = signal(10);
  const $c = computed(() => $a() + $b());

  $a.set(20);
  expect($c()).toBe(30);

  $b.set(20);
  expect($c()).toBe(40);
});

it('should update when deep dependency is updated', () => {
  const $a = signal(10);
  const $b = signal(10);
  const $c = computed(() => $a() + $b());
  const $d = computed(() => $c());

  $a.set(20);
  expect($d()).toBe(30);
});

it('should update when deep computed dependency is updated', () => {
  const $a = signal(10);
  const $b = signal(10);
  const $c = computed(() => $a() + $b());
  const $d = computed(() => $c());
  const $e = computed(() => $d());

  $a.set(20);
  expect($e()).toBe(30);
});

it('should only re-compute when needed', () => {
  const compute = vi.fn();

  const $a = signal(10);
  const $b = signal(10);
  const $c = computed(() => compute($a() + $b()));

  expect(compute).not.toHaveBeenCalled();

  $c();
  expect(compute).toHaveBeenCalledTimes(1);
  expect(compute).toHaveBeenCalledWith(20);

  $c();
  expect(compute).toHaveBeenCalledTimes(1);

  $a.set(20);
  $c();
  expect(compute).toHaveBeenCalledTimes(2);

  $b.set(20);
  $c();
  expect(compute).toHaveBeenCalledTimes(3);

  $c();
  expect(compute).toHaveBeenCalledTimes(3);
});

it('should only re-compute whats needed', () => {
  const computeC = vi.fn();
  const computeD = vi.fn();

  const $a = signal(10);
  const $b = signal(10);
  const $c = computed(() => {
    const a = $a();
    computeC(a);
    return a;
  });
  const $d = computed(() => {
    const b = $b();
    computeD(b);
    return b;
  });
  const $e = computed(() => $c() + $d());

  expect(computeC).not.toHaveBeenCalled();
  expect(computeD).not.toHaveBeenCalled();

  $e();
  expect(computeC).toHaveBeenCalledTimes(1);
  expect(computeD).toHaveBeenCalledTimes(1);
  expect($e()).toBe(20);

  $a.set(20);
  tick();

  $e();
  expect(computeC).toHaveBeenCalledTimes(2);
  expect(computeD).toHaveBeenCalledTimes(1);
  expect($e()).toBe(30);

  $b.set(20);
  tick();

  $e();
  expect(computeC).toHaveBeenCalledTimes(2);
  expect(computeD).toHaveBeenCalledTimes(2);
  expect($e()).toBe(40);
});

it('should discover new dependencies', () => {
  const $a = signal(1);
  const $b = signal(0);

  const $c = computed(() => {
    if ($a()) {
      return $a();
    } else {
      return $b();
    }
  });

  expect($c()).toBe(1);

  $a.set(0);
  tick();
  expect($c()).toBe(0);

  $b.set(10);
  tick();
  expect($c()).toBe(10);
});

it('should accept dirty option', () => {
  const $a = signal(0);

  const $b = computed(() => $a(), {
    // Skip odd numbers.
    dirty: (prev, next) => prev + 1 !== next,
  });

  const effectA = vi.fn();
  effect(() => {
    $b();
    effectA();
  });

  expect($b()).toBe(0);
  expect(effectA).toHaveBeenCalledTimes(1);

  $a.set(2);
  tick();
  expect($b()).toBe(2);
  expect(effectA).toHaveBeenCalledTimes(2);

  // no-change
  $a.set(3);
  tick();
  expect($b()).toBe(2);
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

    expect($a()).toBe('foo');
  });
});

it('should store function values without invoking them', () => {
  const $a = signal(0),
    fnA = () => 'a',
    fnB = () => 'b';

  const $fn = computed(() => ($a() === 0 ? fnA : fnB));

  expect($fn()).toBe(fnA);

  $a.set(1);
  expect($fn()).toBe(fnB);

  $a.set(2);
  expect($fn()).toBe(fnB);
});

it('should not notify observers when a function value is unchanged', () => {
  const $a = signal(0),
    fn = () => {};

  const $fn = computed(() => {
    $a();
    return fn;
  });

  const spy = vi.fn(() => void $fn());
  effect(spy);

  $a.set(1);
  tick();
  expect(spy).toHaveBeenCalledTimes(1);
});

it('should keep the previous value and stay clean after throwing', () => {
  const $a = signal(1);

  const $b = computed(() => {
    if ($a() === 2) throw new Error('bad');
    return $a() * 10;
  });

  expect($b()).toBe(10);

  $a.set(2);
  expect(() => $b()).toThrow('bad');
  expect($b()).toBe(10);

  $a.set(3);
  expect($b()).toBe(30);
});

it('should keep tracking dependencies read before an error', () => {
  const $a = signal(1),
    $b = signal(1),
    spy = vi.fn();

  const $c = computed(() => {
    spy();
    const a = $a();
    if (a === 2) throw new Error('bad');
    return a + $b();
  });

  expect($c()).toBe(2);

  $a.set(2);
  expect(() => $c()).toThrow('bad');
  expect(spy).toHaveBeenCalledTimes(2);

  // `$b` was not read during the failed run so it is no longer a dependency.
  $b.set(5);
  expect($c()).toBe(2);
  expect(spy).toHaveBeenCalledTimes(2);

  $a.set(3);
  expect($c()).toBe(8);
  expect(spy).toHaveBeenCalledTimes(3);
});

it('should not recompute when a dependency is set to the same value', () => {
  const spy = vi.fn(),
    $a = signal(1);

  const $b = computed(() => {
    spy();
    return $a();
  });

  expect($b()).toBe(1);
  $a.set(1);
  expect($b()).toBe(1);
  expect(spy).toHaveBeenCalledTimes(1);
});

it('should recompute only once after multiple writes', () => {
  const spy = vi.fn(),
    $a = signal(1);

  const $b = computed(() => {
    spy();
    return $a();
  });

  $b();
  $a.set(2);
  $a.set(3);
  $a.set(4);
  expect($b()).toBe(4);
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should not recompute an unobserved computed until it is read', () => {
  const spy = vi.fn(),
    $a = signal(1);

  const $b = computed(() => {
    spy();
    return $a();
  });

  $b();
  $a.set(2);
  tick();
  expect(spy).toHaveBeenCalledTimes(1);
  $b();
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should compute with an object initial value that is later replaced', () => {
  const $a = signal<{ v: number } | null>(null);

  const $b = computed(() => $a()?.v ?? -1, { initial: 100 });

  expect($b()).toBe(-1);
  $a.set({ v: 5 });
  expect($b()).toBe(5);
});

it('should use a dev id derived from the kind of computation', () => {
  const $a = signal(0),
    $b = computed(() => 0),
    $c = computed(() => 0, { id: 'c' });

  expect($a.node!.id).toBe('signal');
  expect($b.node!.id).toBe('computed');
  expect($c.node!.id).toBe('c');
});
