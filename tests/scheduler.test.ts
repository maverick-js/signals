import { signal, effect, tick, root, onError } from '../src';

afterEach(() => tick());

it('should recover after an unhandled error is thrown during a flush', () => {
  const $a = signal(0);

  let shouldThrow = false;
  effect(() => {
    $a();
    if (shouldThrow) throw new Error('boom');
  });

  shouldThrow = true;
  $a.set(1);
  expect(() => tick()).toThrow('boom');
  shouldThrow = false;

  // The scheduler must still be alive for unrelated effects.
  const $b = signal(0),
    spy = vi.fn(() => void $b());

  effect(spy);
  $b.set(1);
  tick();
  expect(spy).toHaveBeenCalledTimes(2);

  // And the microtask flush must still be scheduled.
  $b.set(2);
  return Promise.resolve().then(() => expect(spy).toHaveBeenCalledTimes(3));
});

it('should keep running the remaining effects when one throws', () => {
  const $a = signal(0),
    spyA = vi.fn(),
    spyB = vi.fn();

  effect(() => {
    spyA($a());
    if ($a() === 1) throw new Error('a');
  });

  effect(() => {
    spyB($a());
  });

  $a.set(1);
  expect(() => tick()).toThrow('a');
  expect(spyA).toHaveBeenCalledTimes(2);
  expect(spyB).toHaveBeenCalledTimes(2);
  expect(spyB).toHaveBeenLastCalledWith(1);
});

it('should rethrow the first error when multiple effects throw', () => {
  const $a = signal(0);

  effect(() => {
    if ($a() === 1) throw new Error('first');
  });

  effect(() => {
    if ($a() === 1) throw new Error('second');
  });

  $a.set(1);
  expect(() => tick()).toThrow('first');
});

it('should flush effects scheduled during a flush that threw', () => {
  const $a = signal(0),
    $b = signal(0),
    spy = vi.fn(() => void $b());

  effect(() => {
    if ($a() === 1) {
      $b.set(1);
      throw new Error('boom');
    }
  });

  effect(spy);

  $a.set(1);
  expect(() => tick()).toThrow('boom');
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should keep flushing on the microtask queue after a handled error', async () => {
  const $a = signal(0),
    handler = vi.fn();

  root(() => {
    onError(handler);
    effect(() => {
      if ($a() === 1) throw new Error('boom');
    });
  });

  $a.set(1);
  await Promise.resolve();
  expect(handler).toHaveBeenCalledTimes(1);

  const $b = signal(0),
    spy = vi.fn(() => void $b());

  effect(spy);
  $b.set(1);
  await Promise.resolve();
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should mark a throwing effect clean so it re-runs on the next change', () => {
  const $a = signal(0),
    handler = vi.fn(),
    spy = vi.fn();

  root(() => {
    onError(handler);
    effect(() => {
      spy($a());
      if ($a() === 1) throw new Error('boom');
    });
  });

  $a.set(1);
  tick();
  expect(handler).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledTimes(2);

  $a.set(2);
  tick();
  expect(spy).toHaveBeenCalledTimes(3);
  expect(spy).toHaveBeenLastCalledWith(2);
});

it('should not run an effect that was disposed earlier in the same flush', () => {
  const $a = signal(0),
    spy = vi.fn();

  let stop!: () => void;

  effect(() => {
    if ($a() === 1) stop();
  });

  stop = effect(() => {
    spy($a());
  });

  $a.set(1);
  tick();
  expect(spy).toHaveBeenCalledTimes(1);
});

it('should not schedule the same effect twice in one flush', () => {
  const $a = signal(0),
    $b = signal(0),
    spy = vi.fn();

  effect(() => {
    spy($a() + $b());
  });

  $a.set(1);
  $b.set(1);
  $a.set(2);
  tick();
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy).toHaveBeenLastCalledWith(3);
});
