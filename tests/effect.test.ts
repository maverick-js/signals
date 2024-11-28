import { computed, signal, effect, flushSync, onDispose } from '../src';

afterEach(() => flushSync());

it('should run effect', () => {
  const $a = signal(0),
    $effect = vi.fn(() => void $a.get());

  effect($effect);
  expect($effect).toHaveBeenCalledTimes(0);

  $a.set(1);
  flushSync();
  expect($effect).toHaveBeenCalledTimes(1);
});

it('should run effect on change', () => {
  const $a = signal(10),
    $b = signal(10),
    $c = computed(() => $a.get() + $b.get()),
    $d = computed(() => $c.get());

  const $effect = vi.fn(() => void $d.get());
  effect($effect);

  expect($effect).to.toHaveBeenCalledTimes(0);

  $a.set(20);
  flushSync();
  expect($effect).to.toHaveBeenCalledTimes(1);

  $b.set(20);
  flushSync();
  expect($effect).to.toHaveBeenCalledTimes(2);

  $a.set(20);
  $b.set(20);
  flushSync();
  expect($effect).to.toHaveBeenCalledTimes(2);
});

it('should handle nested effect', () => {
  const $a = signal(0),
    $b = signal(0);

  const outerEffect = vi.fn(),
    innerEffect = vi.fn(),
    innerDispose = vi.fn();

  const stop = effect(() => {
    $a.get();
    outerEffect();
    effect(() => {
      $b.get();
      innerEffect();
      onDispose(innerDispose);
    });
  });

  expect(outerEffect).toHaveBeenCalledTimes(0);
  expect(innerEffect).toHaveBeenCalledTimes(0);
  expect(innerDispose).toHaveBeenCalledTimes(0);

  $b.set(1);
  flushSync();
  expect(outerEffect).toHaveBeenCalledTimes(1);
  expect(innerEffect).toHaveBeenCalledTimes(1);
  expect(innerDispose).toHaveBeenCalledTimes(0);

  $b.set(2);
  flushSync();
  expect(outerEffect).toHaveBeenCalledTimes(1);
  expect(innerEffect).toHaveBeenCalledTimes(2);
  expect(innerDispose).toHaveBeenCalledTimes(1);

  innerEffect.mockReset();
  innerDispose.mockReset();

  $a.set(1);
  flushSync();
  expect(outerEffect).toHaveBeenCalledTimes(2);
  expect(innerEffect).toHaveBeenCalledTimes(1); // new one is created
  expect(innerDispose).toHaveBeenCalledTimes(1);

  $b.set(3);
  flushSync();
  expect(outerEffect).toHaveBeenCalledTimes(2);
  expect(innerEffect).toHaveBeenCalledTimes(2);
  expect(innerDispose).toHaveBeenCalledTimes(2);

  stop();
  $a.set(10);
  $b.set(10);
  expect(outerEffect).toHaveBeenCalledTimes(2);
  expect(innerEffect).toHaveBeenCalledTimes(2);
  expect(innerDispose).toHaveBeenCalledTimes(3);
});

it('should stop effect', () => {
  const $effect = vi.fn(() => void $a.get());

  const $a = signal(10);

  const stop = effect($effect);

  stop();

  $a.set(20);
  flushSync();

  expect($effect).toHaveBeenCalledTimes(0);
});

it('should call returned dispose function', () => {
  const dispose = vi.fn(),
    $a = signal(0);

  effect(() => {
    $a.get();
    return dispose;
  });

  expect(dispose).toHaveBeenCalledTimes(0);

  for (let i = 1; i <= 3; i += 1) {
    $a.set(i);
    flushSync();
    expect(dispose).toHaveBeenCalledTimes(i - 1);
  }
});

it('should run all disposals before each new run', () => {
  const $effect = vi.fn(() => {
      fnA(), fnB(), $a.get();
    }),
    disposeA = vi.fn(),
    disposeB = vi.fn();

  function fnA() {
    onDispose(disposeA);
  }

  function fnB() {
    onDispose(disposeB);
  }

  const $a = signal(0);
  effect($effect);

  expect($effect).toHaveBeenCalledTimes(0);
  expect(disposeA).toHaveBeenCalledTimes(0);
  expect(disposeB).toHaveBeenCalledTimes(0);

  for (let i = 1; i <= 3; i += 1) {
    $a.set(i);
    flushSync();
    expect($effect).toHaveBeenCalledTimes(i);
    expect(disposeA).toHaveBeenCalledTimes(i - 1);
    expect(disposeB).toHaveBeenCalledTimes(i - 1);
  }
});

it('should dispose of nested effect', () => {
  const $a = signal(0),
    innerEffect = vi.fn();

  const stop = effect(() => {
    effect(() => {
      innerEffect($a.get());
    });
  });

  stop();

  $a.set(10);
  flushSync();

  expect(innerEffect).toHaveBeenCalledTimes(0);
  expect(innerEffect).not.toHaveBeenCalledWith(10);
});

it('should conditionally observe', () => {
  const $a = signal(0),
    $b = signal(0),
    $condition = signal(true),
    $c = computed(() => ($condition.get() ? $a.get() : $b.get()));

  const $effect = vi.fn(() => void $c.get());
  effect($effect);

  expect($effect).toHaveBeenCalledTimes(0);

  $b.set(1);
  flushSync();
  expect($effect).toHaveBeenCalledTimes(1);

  $a.set(1);
  flushSync();
  expect($effect).toHaveBeenCalledTimes(2);

  $condition.set(false);
  flushSync();
  expect($effect).toHaveBeenCalledTimes(2);

  $b.set(2);
  flushSync();
  expect($effect).toHaveBeenCalledTimes(3);

  $a.set(3);
  flushSync();
  expect($effect).toHaveBeenCalledTimes(3);
});

it('should dispose of nested conditional effect', () => {
  const $condition = signal(true);

  const disposeA = vi.fn(),
    disposeB = vi.fn();

  function a() {
    effect(() => {
      onDispose(disposeA);
    });
  }

  function b() {
    effect(() => {
      onDispose(disposeB);
    });
  }

  effect(() => ($condition.get() ? a() : b()));
  flushSync();

  $condition.set(false);
  flushSync();

  expect(disposeA).toHaveBeenCalledTimes(1);
});

// https://github.com/preactjs/signals/issues/152
it('should handle looped effects', () => {
  let values: number[] = [],
    loop = 2;

  const $value = signal(0);

  let x = 0;
  effect(() => {
    x++;
    values.push($value.get());
    for (let i = 0; i < loop; i++) {
      effect(() => {
        values.push($value.get() + i);
      });
    }
  });

  flushSync();

  expect(values).toHaveLength(3);
  expect(values.join(',')).toBe('0,0,1');

  loop = 1;
  values = [];
  $value.set(1);
  flushSync();

  expect(values).toHaveLength(2);
  expect(values.join(',')).toBe('1,1');

  values = [];
  $value.set(2);
  flushSync();

  expect(values).toHaveLength(2);
  expect(values.join(',')).toBe('2,2');
});

it('should apply changes in effect in same flush', async () => {
  const $a = signal(0),
    $b = signal(0),
    $c = computed(() => $a.get() + 1),
    $d = computed(() => $c.get() + 2);

  effect(() => {
    $a.next((n) => n + 1);
    $b.get();
  });

  expect($a.get()).toBe(0);
  expect($c.get()).toBe(1);
  expect($d.get()).toBe(3);

  flushSync();

  expect($a.get()).toBe(1);
  expect($c.get()).toBe(2);
  expect($d.get()).toBe(4);

  $b.set(1);

  await Promise.resolve();

  expect($a.get()).toBe(2);
  expect($d.get()).toBe(5);
  expect($c.get()).toBe(3);

  $b.set(2);

  await Promise.resolve();

  expect($a.get()).toBe(3);
  expect($d.get()).toBe(6);
  expect($c.get()).toBe(4);
});

it('runs parent effects before child effects', () => {
  const $a = signal(0),
    $b = computed(() => $a.get());

  let calls = 0;
  effect(() => {
    effect(() => {
      void $a.get();
      calls++;
    });

    $b.get();
  });

  $a.set(1);
  flushSync();
  expect(calls).toBe(1);
});
