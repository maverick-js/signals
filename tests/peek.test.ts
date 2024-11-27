import { computed, signal, peek, effect, flushSync, onDispose, root } from '../src';

afterEach(() => flushSync());

it('should not create dependency', () => {
  const effectA = vi.fn();
  const computeC = vi.fn();

  const $a = signal(10);
  const $b = computed(() => $a() + 10);
  const $c = computed(() => {
    computeC();
    return peek($b) + 10;
  });

  effect(() => {
    effectA();
    expect(peek($a)).toBe(10);
    expect(peek($b)).toBe(20);
    expect(peek($c)).toBe(30);
  });

  expect(effectA).toHaveBeenCalledTimes(0);

  flushSync();

  expect(effectA).toHaveBeenCalledTimes(1);
  expect(computeC).toHaveBeenCalledTimes(1);

  $a.set(20);
  flushSync();
  expect(effectA).toHaveBeenCalledTimes(1);
  expect(computeC).toHaveBeenCalledTimes(1);
});

it('should not affect deep dependency being created', () => {
  const effectA = vi.fn();
  const computeD = vi.fn();

  const $a = signal(10);
  const $b = signal(10);
  const $c = signal(10);
  const $d = computed(() => {
    computeD();
    return $a() + peek($b) + peek($c) + 10;
  });

  effect(() => {
    effectA();
    expect(peek($a)).toBe(10);
    expect(peek($d)).toBe(40);
  });

  expect(effectA).toHaveBeenCalledTimes(0);

  flushSync();

  expect(effectA).toHaveBeenCalledTimes(1);
  expect($d()).toBe(40);
  expect(computeD).toHaveBeenCalledTimes(1);

  $a.set(20);
  flushSync();

  expect(effectA).toHaveBeenCalledTimes(1);
  expect($d()).toBe(50);
  expect(computeD).toHaveBeenCalledTimes(2);

  $b.set(20);
  flushSync();

  expect(effectA).toHaveBeenCalledTimes(1);
  expect($d()).toBe(50);
  expect(computeD).toHaveBeenCalledTimes(2);

  $c.set(20);
  flushSync();

  expect(effectA).toHaveBeenCalledTimes(1);
  expect($d()).toBe(50);
  expect(computeD).toHaveBeenCalledTimes(2);
});

it('should track parent across peeks', () => {
  const $a = signal(0, { id: '$a' });

  const childCompute = vi.fn();
  const childDispose = vi.fn();

  function child() {
    const $b = computed(() => $a() * 2, { id: '$b' });

    effect(() => {
      childCompute($b());
      onDispose(childDispose);
    });
  }

  const dispose = root((dispose) => {
    peek(() => child());
    return dispose;
  });

  $a.set(1);
  flushSync();
  expect(childCompute).toHaveBeenCalledWith(2);
  expect(childDispose).toHaveBeenCalledTimes(0);

  dispose();
  expect(childDispose).toHaveBeenCalledTimes(1);

  $a.set(2);
  flushSync();
  expect(childCompute).not.toHaveBeenCalledWith(4);
  expect(childDispose).toHaveBeenCalledTimes(1);
});
