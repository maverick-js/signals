import { effect, signal, flushSync } from '../src';

afterEach(() => flushSync());

it('should batch updates', () => {
  const $a = signal(10),
    $effect = vi.fn(() => void $a.get());

  effect($effect);

  $a.set(20);
  $a.set(30);
  $a.set(40);

  expect($effect).to.toHaveBeenCalledTimes(0);
  flushSync();
  expect($effect).to.toHaveBeenCalledTimes(1);
});

it('should wait for queue to flush', () => {
  const $a = signal(10),
    $effect = vi.fn(() => void $a.get());

  effect($effect);

  expect($effect).to.toHaveBeenCalledTimes(0);

  $a.set(20);
  flushSync();
  expect($effect).to.toHaveBeenCalledTimes(1);

  $a.set(30);
  flushSync();
  expect($effect).to.toHaveBeenCalledTimes(2);
});

it('should not fail if called while flushing', () => {
  const $a = signal(10),
    $effect = vi.fn(() => {
      $a.get();
      flushSync();
    });

  effect(() => {
    $effect();
  });

  expect($effect).to.toHaveBeenCalledTimes(0);

  $a.set(20);
  flushSync();

  expect($effect).to.toHaveBeenCalledTimes(1);
});
