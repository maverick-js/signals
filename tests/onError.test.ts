import { root, effect, onError, signal, tick } from '../src';

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

it('should forward error to another handler', () => {
  const error = new Error();
  const handler = vi.fn();

  const $a = signal(0);

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
  tick();
  expect(handler).toHaveBeenCalledTimes(2);
});

it('should not duplicate error handler', () => {
  const error = new Error();
  const handler = vi.fn();

  const $a = signal(0);

  let shouldThrow = false;
  root(() => {
    effect(() => {
      $a();
      onError(() => handler());
      if (shouldThrow) throw error;
    });
  });

  $a.set(1);
  tick();

  shouldThrow = true;
  $a.set(2);
  tick();
  expect(handler).toHaveBeenCalledTimes(1);
});
