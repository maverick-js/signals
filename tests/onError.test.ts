import { root, effect, onError, observable, tick } from '../src';

it('should let errors should bubble up when not handled', () => {
  const error = new Error();
  expect(() => {
    root(() => {
      effect(() => {
        throw error;
      });
    });
  }).toThrowError(error);
});

it('should handle error', () => {
  const error = new Error();
  const handler = vi.fn();

  root(() => {
    effect(() => {
      onError(handler);
      throw error;
    });
  });

  expect(handler).toHaveBeenCalledWith(error);
});

it('should forward error to another handler', async () => {
  const error = new Error();
  const handler = vi.fn();

  const $a = observable(0);

  root(() => {
    effect(() => {
      onError(handler);

      effect(() => {
        $a();

        onError((error) => {
          throw error;
        });

        throw error;
      });
    });
  });

  expect(handler).toHaveBeenCalledWith(error);

  $a.set(1);
  await tick();
  expect(handler).toHaveBeenCalledTimes(2);
});

it('should not duplicate error handler', async () => {
  const error = new Error();
  const handler = vi.fn();

  const $a = observable(0);

  let shouldThrow = false;
  root(() => {
    effect(() => {
      $a();
      onError(handler);
      if (shouldThrow) throw error;
    });
  });

  $a.set(1);
  await tick();

  shouldThrow = true;
  $a.set(2);
  await tick();
  expect(handler).toHaveBeenCalledTimes(1);
});
