import { getContext, root, setContext, scope, onError } from '../src';

it('should scope function', () => {
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
