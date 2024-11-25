import { signal, flushSync, readonly } from '../src';

afterEach(() => flushSync());

it('should create readonly proxy', () => {
  const $a = signal(10);
  const $b = readonly($a);

  expect(() => {
    // @ts-expect-error
    $b.set(10);
  }).toThrow();

  expect(() => {
    // @ts-expect-error
    $b.set((n) => n + 10);
  }).toThrow();

  flushSync();
  expect($b()).toBe(10);

  $a.set(20);
  flushSync();
  expect($b()).toBe(20);
});
