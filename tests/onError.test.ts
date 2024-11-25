import { root, effect, onError, signal, flushSync } from '../src';

it('should let errors bubble up when not handled', () => {
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
  const error = new Error(),
    handler = vi.fn();

  root(() => {
    effect(() => {
      onError(handler);
      throw error;
    });
  });

  expect(handler).toHaveBeenCalledWith(error);
});

it('should throw error if there are no handlers left', () => {
  const error = new Error(),
    handler = vi.fn((error) => {
      throw error;
    });

  expect(() => {
    effect(() => {
      onError(handler);
      throw error;
    });
  }).toThrow(error);

  expect(handler).toHaveBeenCalledWith(error);
});

it('should forward error to another handler', () => {
  const error = new Error(),
    handler = vi.fn();

  let $a = signal(0);

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
  expect(handler).toHaveBeenCalledTimes(1);

  $a.set(1);
  flushSync();
  expect(handler).toHaveBeenCalledTimes(2);
});

it('should not duplicate error handler', () => {
  const error = new Error(),
    handler = vi.fn();

  let $a = signal(0),
    shouldThrow = false;

  root(() => {
    effect(() => {
      $a();
      onError(() => handler());
      if (shouldThrow) throw error;
    });
  });

  $a.set(1);
  flushSync();

  shouldThrow = true;
  $a.set(2);
  flushSync();
  expect(handler).toHaveBeenCalledTimes(1);
});

it('should not trigger wrong handler', () => {
  const error = new Error(),
    rootHandler = vi.fn(),
    handler = vi.fn();

  let $a = signal(0),
    shouldThrow = false;

  root(() => {
    onError(rootHandler);

    effect(() => {
      $a();
      if (shouldThrow) throw error;
    });

    effect(() => {
      onError(handler);
    });
  });

  shouldThrow = true;
  $a.set(1);
  flushSync();

  expect(rootHandler).toHaveBeenCalledWith(error);
  expect(handler).not.toHaveBeenCalledWith(error);
});

it('should not coerce error', () => {
  const error = 10,
    handler = vi.fn();

  root(() => {
    effect(() => {
      onError(handler);
      throw error;
    });
  });

  expect(handler).toHaveBeenCalledWith(error);
});
