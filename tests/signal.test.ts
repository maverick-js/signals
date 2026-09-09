import { effect, isReadSignal, signal, tick } from '../src';

afterEach(() => tick());

it('should store and return value on read', () => {
  const $a = signal(10);
  expect(isReadSignal($a)).toBe(true);
  expect($a.get()).toBe(10);
  expect($a.peek()).toBe(10);
});

it('should update signal via `set()`', () => {
  const $a = signal(10);
  $a.set(20);
  expect($a.get()).toBe(20);
});

it('should update signal via next function', () => {
  const $a = signal(10);
  $a.set((n) => n + 10);
  expect($a.get()).toBe(20);
});

it('should accept equals option', () => {
  const $a = signal(10, {
    // Treat the next number as equal (skip odd numbers).
    equals: (prev, next) => prev + 1 === next,
  });

  $a.set(11);
  tick();
  expect($a.get()).toBe(10);

  $a.set(12);
  tick();
  expect($a.get()).toBe(12);

  $a.set(13);
  tick();
  expect($a.get()).toBe(12);
});

it('should update signal with functional value', () => {
  const $a = signal<() => number>(() => 10);
  expect($a.get()()).toBe(10);
  $a.set(() => () => 20);
  expect($a.get()()).toBe(20);
});

it('should compare values with Object.is by default', () => {
  const $nan = signal(NaN),
    nanRuns = vi.fn(() => void $nan.get());

  effect(nanRuns);
  $nan.set(NaN);
  tick();
  expect(nanRuns).toHaveBeenCalledTimes(1);

  const $zero = signal(0),
    zeroRuns = vi.fn(() => void $zero.get());

  effect(zeroRuns);
  $zero.set(-0);
  tick();
  expect(zeroRuns).toHaveBeenCalledTimes(2);
  expect(Object.is($zero.get(), -0)).toBe(true);
});

it('should skip notifying when a custom equals returns true', () => {
  const $point = signal({ x: 1, y: 1 }, { equals: (a, b) => a.x === b.x && a.y === b.y }),
    runs = vi.fn(() => void $point.get());

  effect(runs);

  $point.set({ x: 1, y: 1 });
  tick();
  expect(runs).toHaveBeenCalledTimes(1);

  $point.set({ x: 2, y: 1 });
  tick();
  expect(runs).toHaveBeenCalledTimes(2);
});
