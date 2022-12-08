import { signal, tick, readonly } from '../src';

afterEach(() => tick());

it('should create readonly proxy', () => {
  const $a = signal(10);
  const $b = readonly($a);

  expect(() => {
    // @ts-expect-error
    $b.set(10);
  }).toThrow();

  expect(() => {
    // @ts-expect-error
    $b.next((n) => n + 10);
  }).toThrow();

  tick();
  expect($b()).toBe(10);

  $a.set(20);
  tick();
  expect($b()).toBe(20);
});
