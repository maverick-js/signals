import { $effect, $observable, getScheduler } from '../src';

it('should flush queue synchronously', async () => {
  const scheduler = getScheduler();

  const $a = $observable(0);
  const $b = $observable(0);

  const effect = vi.fn();
  $effect(() => {
    $a(), $b(), effect();
  });

  $a.set(2);
  $b.set(3);

  scheduler.syncFlush();
  expect($a()).toBe(2);
  expect($b()).toBe(3);
  expect(effect).toHaveBeenCalledTimes(2);

  $a.set(4);
  $b.set(6);

  scheduler.syncFlush();
  expect($a()).toBe(4);
  expect($b()).toBe(6);
  expect(effect).toHaveBeenCalledTimes(3);
});

it('should call `onFlush` callbacks', () => {
  const scheduler = getScheduler();

  const callbackA = vi.fn();
  const callbackB = vi.fn();

  const removeA = scheduler.onFlush(callbackA);
  const removeB = scheduler.onFlush(callbackB);

  scheduler.syncFlush();

  expect(callbackA).toHaveBeenCalledTimes(1);
  expect(callbackB).toHaveBeenCalledTimes(1);

  removeA();
  removeB();

  scheduler.syncFlush();

  expect(callbackA).toHaveBeenCalledTimes(1);
  expect(callbackB).toHaveBeenCalledTimes(1);
});
