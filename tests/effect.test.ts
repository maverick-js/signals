import { computed, observable, effect, tick, onDispose } from '../src';

afterEach(() => tick());

it('should run effect on change', async () => {
  const effectA = vi.fn();

  const $a = observable(10);
  const $b = observable(10);
  const $c = computed(() => $a() + $b());
  const $d = computed(() => $c());

  effect(() => {
    effectA();
    $d();
  });

  expect(effectA).to.toHaveBeenCalledTimes(1);

  $a.set(20);
  await tick();
  expect(effectA).to.toHaveBeenCalledTimes(2);

  $b.set(20);
  await tick();
  expect(effectA).to.toHaveBeenCalledTimes(3);

  $a.set(20);
  $b.set(20);
  await tick();
  expect(effectA).to.toHaveBeenCalledTimes(3);
});

it('should handle nested effect', async () => {
  const $a = observable(0);
  const $b = observable(0);

  const outerEffect = vi.fn();
  const innerEffect = vi.fn();
  const innerDispose = vi.fn();

  const stop = effect(() => {
    $a();
    outerEffect();
    effect(() => {
      $b();
      innerEffect();
      onDispose(innerDispose);
    });
  });

  expect(outerEffect).toHaveBeenCalledTimes(1);
  expect(innerEffect).toHaveBeenCalledTimes(1);
  expect(innerDispose).toHaveBeenCalledTimes(0);

  $b.set(1);
  await tick();
  expect(outerEffect).toHaveBeenCalledTimes(1);
  expect(innerEffect).toHaveBeenCalledTimes(2);
  expect(innerDispose).toHaveBeenCalledTimes(1);

  $b.set(2);
  await tick();
  expect(outerEffect).toHaveBeenCalledTimes(1);
  expect(innerEffect).toHaveBeenCalledTimes(3);
  expect(innerDispose).toHaveBeenCalledTimes(2);

  innerEffect.mockReset();
  innerDispose.mockReset();

  $a.set(1);
  await tick();
  expect(outerEffect).toHaveBeenCalledTimes(2);
  expect(innerEffect).toHaveBeenCalledTimes(1); // new one is created
  expect(innerDispose).toHaveBeenCalledTimes(1);

  $b.set(3);
  await tick();
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

it('should stop effect', async () => {
  const effectA = vi.fn();

  const $a = observable(10);

  const stop = effect(() => {
    effectA();
    $a();
  });

  stop();

  $a.set(20);
  await tick();
  expect(effectA).toHaveBeenCalledTimes(1);
});

it('should call returned dispose function', async () => {
  const dispose = vi.fn();

  const $a = observable(0);

  effect(() => {
    $a();
    return dispose;
  });

  expect(dispose).toHaveBeenCalledTimes(0);

  for (let i = 1; i <= 3; i += 1) {
    $a.set(i);
    await tick();
    expect(dispose).toHaveBeenCalledTimes(i);
  }
});

it('should run all disposals before each new run', async () => {
  const effectA = vi.fn();
  const disposeA = vi.fn();
  const disposeB = vi.fn();

  function fnA() {
    onDispose(disposeA);
  }

  function fnB() {
    onDispose(disposeB);
  }

  const $a = observable(0);
  effect(() => {
    effectA();
    fnA(), fnB(), $a();
  });

  expect(effectA).toHaveBeenCalledTimes(1);
  expect(disposeA).toHaveBeenCalledTimes(0);
  expect(disposeB).toHaveBeenCalledTimes(0);

  for (let i = 1; i <= 3; i += 1) {
    $a.set(i);
    await tick();
    expect(effectA).toHaveBeenCalledTimes(i + 1);
    expect(disposeA).toHaveBeenCalledTimes(i);
    expect(disposeB).toHaveBeenCalledTimes(i);
  }
});

it('should dispose of nested effect', async () => {
  const $a = observable(0);
  const innerEffect = vi.fn();

  const stop = effect(() => {
    effect(() => {
      innerEffect($a());
    });
  });

  stop();

  $a.set(10);
  await tick();
  expect(innerEffect).toHaveBeenCalledTimes(1);
  expect(innerEffect).not.toHaveBeenCalledWith(10);
});

it.skip('should conditionally observe', async () => {
  const $a = observable(0);
  const $b = observable(0);
  const $cond = observable(true);
  const spy = vi.fn(() => ($cond() ? $a() : $b()));

  effect(() => {
    spy();
  });

  expect(spy).toHaveBeenCalledTimes(1);

  $b.set(1);
  await tick();
  expect(spy).toHaveBeenCalledTimes(1);

  $a.set(1);
  await tick();
  expect(spy).toHaveBeenCalledTimes(2);

  $cond.set(false);
  await tick();
  expect(spy).toHaveBeenCalledTimes(3);

  spy.mockReset();

  $b.set(2);
  await tick();
  expect(spy).toHaveBeenCalledTimes(1);

  $a.set(2);
  await tick();
  expect(spy).toHaveBeenCalledTimes(1);
});

it('should dispose of nested conditional effect', async () => {
  const $cond = observable(true);

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

  effect(() => ($cond() ? fnA() : fnB()));

  $cond.set(false);
  await tick();
  expect(disposeA).toHaveBeenCalledTimes(1);
});

// https://github.com/preactjs/signals/issues/152
it('should handle looped effects', async () => {
  let values: number[] = [],
    loop = 2;

  const $value = observable(0);

  effect(() => {
    values.push($value());
    for (let i = 0; i < loop; i++) {
      effect(() => {
        values.push($value() + i);
      });
    }
  });

  expect(values).toHaveLength(3);
  expect(values.join(',')).toBe('0,0,1');

  loop = 1;
  values = [];
  $value.set(1);
  await tick();

  expect(values).toHaveLength(2);
  expect(values.join(',')).toBe('1,1');

  values = [];
  $value.set(2);
  await tick();

  expect(values).toHaveLength(2);
  expect(values.join(',')).toBe('2,2');
});
