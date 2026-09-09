import { effect, tick, onDispose, root, createScope, scoped, signal, onError } from '../src';

afterEach(() => tick());

it('should be invoked when computation is disposed', () => {
  const callback1 = vi.fn();
  const callback2 = vi.fn();
  const callback3 = vi.fn();

  const stop = effect(() => {
    onDispose(callback1);
    onDispose(callback2);
    onDispose(callback3);
  });

  stop();

  expect(callback1).toHaveBeenCalled();
  expect(callback2).toHaveBeenCalled();
  expect(callback3).toHaveBeenCalled();
});

it('should clear disposal early', () => {
  const dispose = vi.fn();

  const stop = effect(() => {
    const early = onDispose(dispose);
    early();
  });

  expect(dispose).toHaveBeenCalledTimes(1);

  stop();
  tick();

  expect(dispose).toHaveBeenCalledTimes(1);
});

it('should not trigger wrong onDispose', () => {
  const dispose = vi.fn();

  root(() => {
    effect(() => {
      onDispose(dispose);
    });

    const stop = effect(() => {});

    stop();
    tick();

    expect(dispose).toHaveBeenCalledTimes(0);
  });
});

it('should dispose in-reverse-order', () => {
  const order: string[] = [];

  const dispose = root((dispose) => {
    onDispose(() => {
      order.push('root');
    });

    effect(() => {
      onDispose(() => {
        order.push('effect');
      });

      effect(() => {
        onDispose(() => {
          order.push('nested-effect');
        });
      });
    });

    return dispose;
  });

  dispose();
  expect(order).toEqual(['nested-effect', 'effect', 'root']);
});

it('should dispose all roots', () => {
  const disposals: string[] = [];

  const dispose = root((dispose) => {
    onDispose(() => disposals.push('root'));
    onDispose(() => disposals.push('root_2'));

    root(() => {
      onDispose(() => disposals.push('s1'));
      effect(() => onDispose(() => disposals.push('s1_effect_1')));
      effect(() => onDispose(() => disposals.push('s1_effect_2')));
      effect(() => onDispose(() => disposals.push('s1_effect_3')));
    });

    root(() => {
      onDispose(() => disposals.push('s2'));
      effect(() => onDispose(() => disposals.push('s2_effect_1')));
      effect(() => onDispose(() => disposals.push('s2_effect_2')));
      effect(() => onDispose(() => disposals.push('s2_effect_3')));
    });

    return dispose;
  });

  dispose();
  expect(disposals).toMatchInlineSnapshot(`
    [
      "s2_effect_3",
      "s2_effect_2",
      "s2_effect_1",
      "s2",
      "s1_effect_3",
      "s1_effect_2",
      "s1_effect_1",
      "s1",
      "root_2",
      "root",
    ]
  `);
});

it('should dispose correctly on appended scopes', () => {
  const disposals: string[] = [];

  const scopeA = createScope(),
    scopeB = createScope();

  scoped(() => {
    onDispose(() => disposals.push('scope_a'));
    effect(() => {
      effect(() => {
        return () => {
          disposals.push('a_effect_two');
        };
      });
      return () => {
        disposals.push('a_effect_one');
      };
    });
  }, scopeA);

  scoped(() => {
    onDispose(() => disposals.push('scope_b'));
    effect(() => {
      effect(() => {
        return () => {
          disposals.push('b_effect_two');
        };
      });
      return () => {
        disposals.push('b_effect_one');
      };
    });
  }, scopeB);

  scopeA.append(scopeB);
  scopeB.dispose();
  expect(disposals).toMatchInlineSnapshot(`
    [
      "b_effect_two",
      "b_effect_one",
      "scope_b",
    ]
  `);

  scopeA.dispose();
  expect(disposals).toMatchInlineSnapshot(`
    [
      "b_effect_two",
      "b_effect_one",
      "scope_b",
      "a_effect_two",
      "a_effect_one",
      "scope_a",
    ]
  `);
});

it('should call the early-dispose handle only once', () => {
  const dispose = vi.fn();

  effect(() => {
    const early = onDispose(dispose);
    early();
    early();
  });

  expect(dispose).toHaveBeenCalledTimes(1);
});

it('should ignore a stale early-dispose handle after the scope re-runs', () => {
  const $a = signal(0),
    d1 = vi.fn(),
    d2 = vi.fn(),
    d3 = vi.fn();

  let early!: () => void;

  const stop = effect(() => {
    if ($a.get() === 0) {
      early = onDispose(d1);
    } else {
      onDispose(d2);
      onDispose(d3);
    }
  });

  $a.set(1);
  tick();
  expect(d1).toHaveBeenCalledTimes(1);

  // Stale handle from run 1: must not call `d1` again nor remove anything from run 2.
  early();
  expect(d1).toHaveBeenCalledTimes(1);

  stop();
  expect(d2).toHaveBeenCalledTimes(1);
  expect(d3).toHaveBeenCalledTimes(1);
});

it('should ignore a stale early-dispose handle when the new run registered a single disposable', () => {
  const $a = signal(0),
    d1 = vi.fn(),
    d2 = vi.fn();

  let early!: () => void;

  const stop = effect(() => {
    if ($a.get() === 0) early = onDispose(d1);
    else onDispose(d2);
  });

  $a.set(1);
  tick();
  early();
  expect(d1).toHaveBeenCalledTimes(1);

  stop();
  expect(d2).toHaveBeenCalledTimes(1);
});

it('should ignore a stale early-dispose handle after the scope is disposed', () => {
  const dispose = vi.fn();

  let early!: () => void;

  const stop = effect(() => {
    early = onDispose(dispose);
  });

  stop();
  early();
  expect(dispose).toHaveBeenCalledTimes(1);
});

it('should run remaining disposables when one throws and is handled', () => {
  const $a = signal(0),
    handler = vi.fn(),
    d1 = vi.fn(() => {
      throw new Error('d1');
    }),
    d2 = vi.fn();

  root(() => {
    onError(handler);
    effect(() => {
      $a.get();
      onDispose(d2);
      onDispose(d1); // LIFO => runs first and throws.
    });
  });

  $a.set(1);
  tick();
  expect(handler).toHaveBeenCalledTimes(1);
  expect(d1).toHaveBeenCalledTimes(1);
  expect(d2).toHaveBeenCalledTimes(1);

  // A throwing disposable must not be kept around and re-run on the next cleanup.
  $a.set(2);
  tick();
  expect(handler).toHaveBeenCalledTimes(2);
  expect(d1).toHaveBeenCalledTimes(2);
  expect(d2).toHaveBeenCalledTimes(2);
});

it('should run a disposable immediately when registered in an already disposed scope', () => {
  const $a = signal(0),
    dispose = vi.fn();

  const stop = effect(() => {
    if ($a.get() === 1) {
      stop();
      onDispose(dispose);
    }
  });

  $a.set(1);
  tick();
  expect(dispose).toHaveBeenCalledTimes(1);
});

it('should return the disposable itself when there is no scope', () => {
  const dispose = () => {};
  expect(onDispose(dispose)).toBe(dispose);
  expect(typeof onDispose(null)).toBe('function');
});
