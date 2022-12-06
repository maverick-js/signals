import { signal, tick } from '../src';

afterEach(() => tick());

it('should store and return value on read', () => {
  const $a = signal(10);
  expect($a).toBeInstanceOf(Function);
  expect($a()).toBe(10);
});

it('should update signal via `set()`', () => {
  const $a = signal(10);
  $a.set(20);
  expect($a()).toBe(20);
});

it('should update signal via `next()`', () => {
  const $a = signal(10);
  $a.next((n) => n + 10);
  expect($a()).toBe(20);
});

it('should accept dirty option', async () => {
  const $a = signal(10, {
    // Skip odd numbers.
    dirty: (prev, next) => prev + 1 !== next,
  });

  $a.set(11);
  await tick();
  expect($a()).toBe(10);

  $a.set(12);
  await tick();
  expect($a()).toBe(12);

  $a.set(13);
  await tick();
  expect($a()).toBe(12);
});
