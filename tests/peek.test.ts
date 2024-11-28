import { computed, signal, peek, effect, flushSync, onDispose, root } from '../src';

afterEach(() => flushSync());

it('should not create dependency', () => {
  const effectA = vi.fn(),
    computeC = vi.fn();

  const $a = signal(10),
    $b = computed(() => $a.get() + 10),
    $c = computed(() => {
      computeC();
      return peek(() => $b.get()) + 10;
    });

  effect(() => {
    effectA();
    expect(peek(() => $a.get())).toBe(10);
    expect(peek(() => $b.get())).toBe(20);
    expect(peek(() => $c.get())).toBe(30);
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
  const effectA = vi.fn(),
    computeD = vi.fn();

  const $a = signal(10),
    $b = signal(10),
    $c = signal(10),
    $d = computed(() => {
      computeD();
      return $a.get() + peek(() => $b.get()) + peek(() => $c.get()) + 10;
    });

  effect(() => {
    effectA();
    expect(peek(() => $a.get())).toBe(10);
    expect(peek(() => $d.get())).toBe(40);
  });

  expect(effectA).toHaveBeenCalledTimes(0);

  flushSync();

  expect(effectA).toHaveBeenCalledTimes(1);
  expect($d.get()).toBe(40);
  expect(computeD).toHaveBeenCalledTimes(1);

  $a.set(20);
  flushSync();

  expect(effectA).toHaveBeenCalledTimes(1);
  expect($d.get()).toBe(50);
  expect(computeD).toHaveBeenCalledTimes(2);

  $b.set(20);
  flushSync();

  expect(effectA).toHaveBeenCalledTimes(1);
  expect($d.get()).toBe(50);
  expect(computeD).toHaveBeenCalledTimes(2);

  $c.set(20);
  flushSync();

  expect(effectA).toHaveBeenCalledTimes(1);
  expect($d.get()).toBe(50);
  expect(computeD).toHaveBeenCalledTimes(2);
});

it('should track parent across peeks', () => {
  const $a = signal(0);

  const childCompute = vi.fn();
  const childDispose = vi.fn();

  function child() {
    const $b = computed(() => $a.get() * 2);
    effect(() => {
      childCompute($b.get());
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
