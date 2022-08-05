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
  const innerEffect = vi.fn();
  const innerDispose = vi.fn();

  const stop = effect(() => {
    $a();
    effect(() => {
      $b();
      innerEffect();
      onDispose(innerDispose);
    });
  });

  expect(innerEffect).toHaveBeenCalledTimes(1);
  expect(innerDispose).toHaveBeenCalledTimes(0);

  $a.set(1);
  await tick();
  expect(innerEffect).toHaveBeenCalledTimes(2); // new one is created
  expect(innerDispose).toHaveBeenCalledTimes(0);

  $b.set(2);
  await tick();
  expect(innerEffect).toHaveBeenCalledTimes(4);
  expect(innerDispose).toHaveBeenCalledTimes(2);

  stop();
  expect(innerEffect).toHaveBeenCalledTimes(4);
  expect(innerDispose).toHaveBeenCalledTimes(4);

  $b.set(3);
  await tick();
  expect(innerEffect).toHaveBeenCalledTimes(4);
  expect(innerDispose).toHaveBeenCalledTimes(4);
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

  const stop = effect(() => {
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
