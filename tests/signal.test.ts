import { signal, flushSync } from '../src';

afterEach(() => flushSync());

it('should store and return value on read', () => {
  const $a = signal(10);
  expect($a).toBeInstanceOf(Function);
  expect($a.get()).toBe(10);
});

it('should update signal via `set()`', () => {
  const $a = signal(10);
  $a.set(20);
  expect($a.get()).toBe(20);
});

it('should update signal via next function', () => {
  const $a = signal(10);
  $a.next((n) => n + 10);
  expect($a.get()).toBe(20);
});

it('should update signal with functional value', () => {
  const $a = signal<() => number>(() => 10);
  expect($a.get()()).toBe(10);
  $a.set(() => 20);
  expect($a.get()()).toBe(20);
});
