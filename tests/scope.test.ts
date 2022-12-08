import { getContext, root, setContext, scope, onError, signal, effect, tick } from '../src';

it('should scope function to current scope', () => {
  let callback!: () => void;

  root(() => {
    const fn = () => expect(getContext('id')).toBe(10);
    callback = scope(fn);
    setContext('id', 10);
  });

  callback();
});

it('should return value', () => {
  let callback!: () => void;

  root(() => {
    callback = scope(() => 10);
  });

  expect(callback()).toBe(10);
});

it('should handle errors', () => {
  let callback!: () => void;

  const error = new Error();
  const handler = vi.fn();

  root(() => {
    callback = scope(() => {
      throw error;
    });

    onError(handler);
  });

  callback();
  expect(handler).toHaveBeenCalledWith(error);
});

it('should still run effect', () => {
  let callback!: () => void,
    innerEffect = vi.fn();

  const $a = signal(0);

  root(() => {
    callback = scope(() => {
      $a();
    });
  });

  effect(() => {
    callback();
    innerEffect();
  });

  expect(innerEffect).toBeCalledTimes(1);

  $a.set(1);
  tick();

  expect(innerEffect).toBeCalledTimes(2);
});
