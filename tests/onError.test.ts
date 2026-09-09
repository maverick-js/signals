import {
  root,
  effect,
  onError,
  signal,
  tick,
  computed,
  onDispose,
  createScope,
  scoped,
  getScope,
} from '../src';

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
        $a.get();

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
  tick();
  expect(handler).toHaveBeenCalledTimes(2);
});

it('should not duplicate error handler', () => {
  const error = new Error(),
    handler = vi.fn();

  let $a = signal(0),
    shouldThrow = false;

  root(() => {
    effect(() => {
      $a.get();
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

it('should not trigger wrong handler', () => {
  const error = new Error(),
    rootHandler = vi.fn(),
    handler = vi.fn();

  let $a = signal(0),
    shouldThrow = false;

  root(() => {
    onError(rootHandler);

    effect(() => {
      $a.get();
      if (shouldThrow) throw error;
    });

    effect(() => {
      onError(handler);
    });
  });

  shouldThrow = true;
  $a.set(1);
  tick();

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

it('should use a handler registered on the parent after the child was created', () => {
  const error = new Error(),
    handler = vi.fn(),
    $a = signal(0);

  root(() => {
    effect(() => {
      if ($a.get() === 1) throw error;
    });

    onError(handler);
  });

  $a.set(1);
  tick();
  expect(handler).toHaveBeenCalledWith(error);
});

it('should handle errors thrown in disposal callbacks', () => {
  const error = new Error(),
    handler = vi.fn();

  const dispose = root((dispose) => {
    onError(handler);
    effect(() => {
      onDispose(() => {
        throw error;
      });
    });
    return dispose;
  });

  dispose();
  expect(handler).toHaveBeenCalledWith(error);
});

it('should handle errors thrown in disposal callbacks during a re-run', () => {
  const error = new Error(),
    handler = vi.fn(),
    $a = signal(0);

  root(() => {
    onError(handler);
    effect(() => {
      $a.get();
      onDispose(() => {
        throw error;
      });
    });
  });

  $a.set(1);
  tick();
  expect(handler).toHaveBeenCalledWith(error);
  expect(handler).toHaveBeenCalledTimes(1);
});

it('should try handlers newest first within a scope', () => {
  const calls: string[] = [];

  root(() => {
    onError(() => {
      calls.push('a');
    });

    onError(() => {
      calls.push('b');
    });

    effect(() => {
      throw new Error();
    });
  });

  expect(calls).toEqual(['b']);
});

it('should forward to the older handler in the same scope when the newest rethrows', () => {
  const calls: string[] = [];

  root(() => {
    onError(() => {
      calls.push('a');
    });

    onError((error) => {
      calls.push('b');
      throw error;
    });

    effect(() => {
      throw new Error();
    });
  });

  expect(calls).toEqual(['b', 'a']);
});

it('should handle errors thrown by a computed created in the scope', () => {
  const error = new Error(),
    handler = vi.fn(),
    $a = signal(0);

  root(() => {
    onError(handler);

    const $b = computed(() => {
      if ($a.get() === 1) throw error;
      return $a.get();
    });

    effect(() => {
      $b.get();
    });
  });

  $a.set(1);
  tick();
  expect(handler).toHaveBeenCalledWith(error);
  expect(handler).toHaveBeenCalledTimes(1);
});

it('should handle errors thrown by a computed read during an effect run with the effect handlers', () => {
  const error = new Error(),
    handler = vi.fn(),
    $a = signal(0),
    $b = computed(() => {
      if ($a.get() === 1) throw error;
      return $a.get();
    });

  root(() => {
    onError(handler);
    effect(() => {
      $a.get();
      $b.get();
    });
  });

  $a.set(1);
  tick();
  expect(handler).toHaveBeenCalledWith(error);
});

it('should let an effect continue after a handled error', () => {
  const handler = vi.fn(),
    spy = vi.fn(),
    $a = signal(0);

  root(() => {
    onError(handler);
    effect(() => {
      spy($a.get());
      if ($a.get() === 1) throw new Error();
    });
  });

  $a.set(1);
  tick();
  $a.set(2);
  tick();
  expect(handler).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledTimes(3);
  expect(spy).toHaveBeenLastCalledWith(2);
});

it('should handle errors from a scope appended later with the new parent handlers', () => {
  const error = new Error(),
    handler = vi.fn(),
    parent = createScope(),
    child = createScope();

  scoped(() => onError(handler), parent);
  parent.append(child);

  scoped(() => {
    throw error;
  }, child);

  expect(handler).toHaveBeenCalledWith(error);
});

it('should not share handler arrays between parent and child', () => {
  root(() => {
    const parent = getScope()!;
    onError(() => {});

    effect(() => {
      const child = getScope()!;
      onError(() => {});
      expect(child._handlers).not.toBe(parent._handlers);
      expect(child._handlers).toHaveLength(1);
    });

    expect(parent._handlers).toHaveLength(1);
  });
});
