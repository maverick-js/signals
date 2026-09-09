import { computed, signal, effect, tick, onDispose } from '../src';

afterEach(() => tick());

it('should run effect', () => {
  const $a = signal(0),
    $effect = vi.fn(() => void $a.get());

  effect($effect);
  expect($effect).toHaveBeenCalledTimes(1);

  $a.set(1);
  tick();
  expect($effect).toHaveBeenCalledTimes(2);
});

it('should run effect on change', () => {
  const effectA = vi.fn();

  const $a = signal(10);
  const $b = signal(10);
  const $c = computed(() => $a.get() + $b.get());
  const $d = computed(() => $c.get());

  effect(() => {
    effectA();
    $d.get();
  });

  expect(effectA).to.toHaveBeenCalledTimes(1);

  $a.set(20);
  tick();
  expect(effectA).to.toHaveBeenCalledTimes(2);

  $b.set(20);
  tick();
  expect(effectA).to.toHaveBeenCalledTimes(3);

  $a.set(20);
  $b.set(20);
  tick();
  expect(effectA).to.toHaveBeenCalledTimes(3);
});

it('should handle nested effect', () => {
  const $a = signal(0);
  const $b = signal(0);

  const outerEffect = vi.fn();
  const innerEffect = vi.fn();
  const innerDispose = vi.fn();

  const stop = effect(() => {
    $a.get();
    outerEffect();
    effect(() => {
      $b.get();
      innerEffect();
      onDispose(innerDispose);
    });
  });

  expect(outerEffect).toHaveBeenCalledTimes(1);
  expect(innerEffect).toHaveBeenCalledTimes(1);
  expect(innerDispose).toHaveBeenCalledTimes(0);

  $b.set(1);
  tick();
  expect(outerEffect).toHaveBeenCalledTimes(1);
  expect(innerEffect).toHaveBeenCalledTimes(2);
  expect(innerDispose).toHaveBeenCalledTimes(1);

  $b.set(2);
  tick();
  expect(outerEffect).toHaveBeenCalledTimes(1);
  expect(innerEffect).toHaveBeenCalledTimes(3);
  expect(innerDispose).toHaveBeenCalledTimes(2);

  innerEffect.mockReset();
  innerDispose.mockReset();

  $a.set(1);
  tick();
  expect(outerEffect).toHaveBeenCalledTimes(2);
  expect(innerEffect).toHaveBeenCalledTimes(1); // new one is created
  expect(innerDispose).toHaveBeenCalledTimes(1);

  $b.set(3);
  tick();
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
  const effectA = vi.fn();

  const $a = signal(10);

  const stop = effect(() => {
    effectA();
    $a.get();
  });

  stop();

  $a.set(20);
  tick();
  expect(effectA).toHaveBeenCalledTimes(1);
});

it('should call returned dispose function', () => {
  const dispose = vi.fn();

  const $a = signal(0);

  effect(() => {
    $a.get();
    return dispose;
  });

  expect(dispose).toHaveBeenCalledTimes(0);

  for (let i = 1; i <= 3; i += 1) {
    $a.set(i);
    tick();
    expect(dispose).toHaveBeenCalledTimes(i);
  }
});

it('should run all disposals before each new run', () => {
  const effectA = vi.fn();
  const disposeA = vi.fn();
  const disposeB = vi.fn();

  function fnA() {
    onDispose(disposeA);
  }

  function fnB() {
    onDispose(disposeB);
  }

  const $a = signal(0);
  effect(() => {
    effectA();
    fnA();
    fnB();
    $a.get();
  });

  expect(effectA).toHaveBeenCalledTimes(1);
  expect(disposeA).toHaveBeenCalledTimes(0);
  expect(disposeB).toHaveBeenCalledTimes(0);

  for (let i = 1; i <= 3; i += 1) {
    $a.set(i);
    tick();
    expect(effectA).toHaveBeenCalledTimes(i + 1);
    expect(disposeA).toHaveBeenCalledTimes(i);
    expect(disposeB).toHaveBeenCalledTimes(i);
  }
});

it('should dispose of nested effect', () => {
  const $a = signal(0);
  const innerEffect = vi.fn();

  const stop = effect(() => {
    effect(() => {
      innerEffect($a.get());
    });
  });

  stop();

  $a.set(10);
  tick();
  expect(innerEffect).toHaveBeenCalledTimes(1);
  expect(innerEffect).not.toHaveBeenCalledWith(10);
});

it('should conditionally observe', () => {
  const $a = signal(0);
  const $b = signal(0);
  const $cond = signal(true);
  const $c = computed(() => ($cond.get() ? $a.get() : $b.get()));
  const $effect = vi.fn();

  effect(() => {
    $c.get();
    $effect();
  });

  expect($effect).toHaveBeenCalledTimes(1);

  $b.set(1);
  tick();
  expect($effect).toHaveBeenCalledTimes(1);

  $a.set(1);
  tick();
  expect($effect).toHaveBeenCalledTimes(2);

  $cond.set(false);
  tick();
  expect($effect).toHaveBeenCalledTimes(2);

  $b.set(2);
  tick();
  expect($effect).toHaveBeenCalledTimes(3);

  $a.set(3);
  tick();
  expect($effect).toHaveBeenCalledTimes(3);
});

it('should dispose of nested conditional effect', () => {
  const $cond = signal(true);

  const disposeA = vi.fn();
  const disposeB = vi.fn();

  function fnA() {
    effect(() => {
      onDispose(disposeA);
    });
  }

  function fnB() {
    effect(() => {
      onDispose(disposeB);
    });
  }

  effect(() => ($cond.get() ? fnA() : fnB()));

  $cond.set(false);
  tick();
  expect(disposeA).toHaveBeenCalledTimes(1);
});

// https://github.com/preactjs/signals/issues/152
it('should handle looped effects', () => {
  let values: number[] = [],
    loop = 2;

  const $value = signal(0);

  let x = 0;
  effect(
    () => {
      x++;
      values.push($value.get());
      for (let i = 0; i < loop; i++) {
        effect(
          () => {
            values.push($value.get() + i);
          },
          { id: `inner-effect-${x}-${i}` },
        );
      }
    },
    { id: 'root-effect' },
  );

  tick();

  expect(values).toHaveLength(3);
  expect(values.join(',')).toBe('0,0,1');

  loop = 1;
  values = [];
  $value.set(1);
  tick();

  expect(values).toHaveLength(2);
  expect(values.join(',')).toBe('1,1');

  values = [];
  $value.set(2);
  tick();

  expect(values).toHaveLength(2);
  expect(values.join(',')).toBe('2,2');
});

it('should apply changes in effect in same flush', async () => {
  const $a = signal(0),
    $b = signal(0),
    $c = computed(() => {
      return $a.get() + 1;
    }),
    $d = computed(() => {
      return $c.get() + 2;
    });

  effect(() => {
    $a.set((n) => n + 1);
    $b.get();
  });

  expect($a.get()).toBe(1);
  expect($d.get()).toBe(4);
  expect($c.get()).toBe(2);

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
  const $a = signal(0);
  const $b = computed(() => $a.get());

  let calls = 0;
  effect(() => {
    effect(() => {
      void $a.get();
      calls++;
    });

    $b.get();
  });

  $a.set(1);
  tick();
  expect(calls).toBe(2);
});
