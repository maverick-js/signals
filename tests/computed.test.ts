import { computed, signal, flushSync } from '../src';

afterEach(() => flushSync());

it('should store and return value on read', () => {
  const $a = signal(10),
    $b = signal(10),
    $c = computed(() => $a.get() + $b.get());

  expect($c.get()).toBe(20);
  flushSync();

  // Try again to ensure state is maintained.
  expect($c.get()).toBe(20);
});

it('should update when dependency is updated', () => {
  const $a = signal(10),
    $b = signal(10),
    $c = computed(() => $a.get() + $b.get());

  $a.set(20);
  expect($c.get()).toBe(30);

  $b.set(20);
  expect($c.get()).toBe(40);
});

it('should update when deep dependency is updated', () => {
  const $a = signal(10),
    $b = signal(10),
    $c = computed(() => $a.get() + $b.get()),
    $d = computed(() => $c.get());

  $a.set(20);
  expect($d.get()).toBe(30);
});

it('should update when deep computed dependency is updated', () => {
  const $a = signal(10),
    $b = signal(10),
    $c = computed(() => $a.get() + $b.get()),
    $d = computed(() => $c.get()),
    $e = computed(() => $d.get());

  $a.set(20);
  expect($e.get()).toBe(30);
});

it('should only re-compute when needed', () => {
  const compute = vi.fn();

  const $a = signal(10),
    $b = signal(10),
    $c = computed(() => compute($a.get() + $b.get()));

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
  const computeC = vi.fn(),
    computeD = vi.fn();

  const $a = signal(10),
    $b = signal(10),
    $c = computed(() => {
      const a = $a.get();
      computeC(a);
      return a;
    }),
    $d = computed(() => {
      const b = $b.get();
      computeD(b);
      return b;
    }),
    $e = computed(() => $c.get() + $d.get());

  expect(computeC).not.toHaveBeenCalled();
  expect(computeD).not.toHaveBeenCalled();

  $e.get();
  expect(computeC).toHaveBeenCalledTimes(1);
  expect(computeD).toHaveBeenCalledTimes(1);
  expect($e.get()).toBe(20);

  $a.set(20);
  flushSync();

  $e.get();
  expect(computeC).toHaveBeenCalledTimes(2);
  expect(computeD).toHaveBeenCalledTimes(1);
  expect($e.get()).toBe(30);

  $b.set(20);
  flushSync();

  $e.get();
  expect(computeC).toHaveBeenCalledTimes(2);
  expect(computeD).toHaveBeenCalledTimes(2);
  expect($e.get()).toBe(40);
});

it('should discover new dependencies', () => {
  let $a = signal(1),
    $b = signal(10),
    computeC = vi.fn(() => {
      if ($a.get()) {
        return $a.get();
      } else {
        return $b.get();
      }
    }),
    $c = computed(computeC);

  expect($c.get()).toBe(1);

  $a.set(0);
  flushSync();

  expect($c.get()).toBe(10);
  expect(computeC).toHaveBeenCalledTimes(2);

  $b.set(20);
  flushSync();

  expect($c.get()).toBe(20);
  expect(computeC).toHaveBeenCalledTimes(3);

  $a.set(20);
  flushSync();

  expect($c.get()).toBe(20);
  expect(computeC).toHaveBeenCalledTimes(3);

  $b.set(40);
  flushSync();

  expect($c.get()).toBe(20);
  expect(computeC).toHaveBeenCalledTimes(3);
});
