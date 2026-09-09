import { computed, signal, peek, effect, tick, onDispose, root } from '../src';

afterEach(() => tick());

it('should not create dependency', () => {
  const effectA = vi.fn();
  const computeC = vi.fn();

  const $a = signal(10);
  const $b = computed(() => $a.get() + 10);
  const $c = computed(() => {
    computeC();
    return $b.peek() + 10;
  });

  effect(() => {
    effectA();
    expect($a.peek()).toBe(10);
    expect($b.peek()).toBe(20);
    expect($c.peek()).toBe(30);
  });

  expect(effectA).toHaveBeenCalledTimes(1);
  expect(computeC).toHaveBeenCalledTimes(1);

  $a.set(20);
  tick();
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
    return $a.get() + $b.peek() + $c.peek() + 10;
  });

  effect(() => {
    effectA();
    expect($a.peek()).toBe(10);
    expect($d.peek()).toBe(40);
  });

  expect(effectA).toHaveBeenCalledTimes(1);
  expect($d.get()).toBe(40);
  expect(computeD).toHaveBeenCalledTimes(1);

  $a.set(20);
  tick();
  expect(effectA).toHaveBeenCalledTimes(1);
  expect($d.get()).toBe(50);
  expect(computeD).toHaveBeenCalledTimes(2);

  $b.set(20);
  tick();
  expect(effectA).toHaveBeenCalledTimes(1);
  expect($d.get()).toBe(50);
  expect(computeD).toHaveBeenCalledTimes(2);

  $c.set(20);
  tick();
  expect(effectA).toHaveBeenCalledTimes(1);
  expect($d.get()).toBe(50);
  expect(computeD).toHaveBeenCalledTimes(2);
});

it('should track parent across peeks', () => {
  const $a = signal(0, { id: '$a' });

  const childCompute = vi.fn();
  const childDispose = vi.fn();

  function child() {
    const $b = computed(() => $a.get() * 2, { id: '$b' });
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
  tick();
  expect(childCompute).toHaveBeenCalledWith(2);
  expect(childDispose).toHaveBeenCalledTimes(1);

  dispose();
  expect(childDispose).toHaveBeenCalledTimes(2);

  $a.set(2);
  tick();
  expect(childCompute).not.toHaveBeenCalledWith(4);
  expect(childDispose).toHaveBeenCalledTimes(2);
});
