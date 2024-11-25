import { effect, signal, flushSync } from '../src';

afterEach(() => flushSync());

it('should batch updates', () => {
  const $a = signal(10);
  const $effect = vi.fn(() => void $a());

  effect($effect);

  $a.set(20);
  $a.set(30);
  $a.set(40);

  expect($effect).to.toHaveBeenCalledTimes(1);
  flushSync();
  expect($effect).to.toHaveBeenCalledTimes(2);
});

it('should wait for queue to flush', () => {
  const $a = signal(10);
  const $effect = vi.fn(() => void $a());

  effect($effect);

  expect($effect).to.toHaveBeenCalledTimes(1);

  $a.set(20);
  flushSync();
  expect($effect).to.toHaveBeenCalledTimes(2);

  $a.set(30);
  flushSync();
  expect($effect).to.toHaveBeenCalledTimes(3);
});

it('should not fail if called while flushing', () => {
  const $a = signal(10);
  const $effect = vi.fn(() => {
    $a();
    flushSync();
  });

  effect(() => {
    $effect();
  });

  expect($effect).to.toHaveBeenCalledTimes(1);

  $a.set(20);
  flushSync();
  expect($effect).to.toHaveBeenCalledTimes(2);
});
