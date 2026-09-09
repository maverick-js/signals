import {
  SCOPE,
  computed,
  createScope,
  effect,
  getScope,
  onDispose,
  onError,
  root,
  scoped,
  signal,
  tick,
  type Computation,
  type ReadSignal,
  type Scope,
} from '../src';
import { internals } from './utils';

const STATE_DISPOSED = 3,
  STATE_MASK = 3;

afterEach(() => tick());

it('should keep a disposed computed disposed when an observer is checked', () => {
  const $s = signal(0);

  let $c!: ReadSignal<number>;

  const disposeRoot = root((dispose) => {
    $c = computed(() => $s.get());
    return dispose;
  });

  const $d = computed(() => $s.get() * 10),
    spy = vi.fn(() => $c.get() + $d.get());

  effect(() => void spy());
  expect(spy).toHaveBeenCalledTimes(1);

  disposeRoot();
  expect(internals($c)._state & STATE_MASK).toBe(STATE_DISPOSED);

  $s.set(1);
  tick();
  expect(internals($c)._state & STATE_MASK).toBe(STATE_DISPOSED);
  expect($c.get()).toBe(0); // last value.
});

it('should keep a disposed child effect disposed when its parent re-runs mid-flush', () => {
  const $a = signal(0);

  let child!: Computation;

  effect(() => {
    $a.get();
    effect(() => {
      $a.get();
      child = getScope() as Computation;
    });
  });

  const first = child;

  $a.set(1);
  tick();
  expect(first._state & STATE_MASK).toBe(STATE_DISPOSED);
  expect(child).not.toBe(first);
  expect(child._state & STATE_MASK).not.toBe(STATE_DISPOSED);
});

it('should not re-link an effect that stops itself during its own run', () => {
  const $a = signal(0),
    spy = vi.fn(),
    cleanup = vi.fn();

  const stop = effect(() => {
    spy($a.get());
    if ($a.get() === 1) stop();
    return cleanup;
  });

  $a.set(1);
  tick();
  expect(spy).toHaveBeenCalledTimes(2);
  // Cleanup from run 1 (before run 2) + cleanup returned by run 2 (scope already disposed).
  expect(cleanup).toHaveBeenCalledTimes(2);
  expect(internals($a)._observers).toHaveLength(0);

  $a.set(2);
  tick();
  expect(spy).toHaveBeenCalledTimes(2);
  expect(cleanup).toHaveBeenCalledTimes(2);
});

it('should be idempotent', () => {
  const disposeA = vi.fn();

  const dispose = root((dispose) => {
    onDispose(disposeA);
    return dispose;
  });

  dispose();
  dispose();
  expect(disposeA).toHaveBeenCalledTimes(1);

  const scope = createScope();
  scope.dispose();
  scope.dispose();
});

it('should remove a stopped effect from its parent children list', () => {
  root(() => {
    const scope = getScope()!,
      stopA = effect(() => {}),
      stopB = effect(() => {}),
      stopC = effect(() => {});

    expect(scope._children).toHaveLength(3);

    stopB();
    expect(scope._children).toHaveLength(2);

    stopA();
    stopC();
    expect(scope._children).toHaveLength(0);
  });
});

it('should track children in an array and clear it on dispose', () => {
  const scope = createScope();

  let stopA!: () => void, stopB!: () => void;

  scoped(() => {
    stopA = effect(() => {});
  }, scope);

  expect(scope._children).toHaveLength(1);

  scoped(() => {
    stopB = effect(() => {});
  }, scope);

  expect(scope._children).toHaveLength(2);

  stopA();
  stopB();
  expect(scope._children).toHaveLength(0);

  scope.dispose();
  expect(scope._children).toBeNull();
});

it('should unlink from sources on dispose', () => {
  const $a = signal(0),
    $b = signal(0);

  const stop = effect(() => {
    $a.get();
    $b.get();
  });

  expect(internals($a)._observers).toHaveLength(1);
  expect(internals($b)._observers).toHaveLength(1);

  stop();
  expect(internals($a)._observers).toHaveLength(0);
  expect(internals($b)._observers).toHaveLength(0);
});

it('should unlink a disposed computed from its sources and its observers from it', () => {
  const $a = signal(0);

  let $c!: ReadSignal<number>;

  const dispose = root((dispose) => {
    $c = computed(() => $a.get());
    return dispose;
  });

  const stop = effect(() => void $c.get());
  expect(internals($a)._observers).toHaveLength(1);
  expect(internals($c)._observers).toHaveLength(1);

  dispose();
  expect(internals($a)._observers).toHaveLength(0);
  expect(internals($c)._observers).toBeNull();
  expect(internals($c)._sources).toBeNull();

  stop();
});

it('should dispose children before the parent disposal callbacks', () => {
  const order: string[] = [];

  const dispose = root((dispose) => {
    onDispose(() => order.push('root'));
    effect(() => {
      onDispose(() => order.push('effect'));
      effect(() => {
        onDispose(() => order.push('nested'));
      });
    });
    return dispose;
  });

  dispose();
  expect(order).toEqual(['nested', 'effect', 'root']);
});

it('should dispose siblings in reverse creation order', () => {
  const order: number[] = [];

  const dispose = root((dispose) => {
    for (let i = 0; i < 5; i++) effect(() => onDispose(() => order.push(i)));
    return dispose;
  });

  dispose();
  expect(order).toEqual([4, 3, 2, 1, 0]);
});

it('should dispose many children', () => {
  const disposed = vi.fn();

  const dispose = root((dispose) => {
    for (let i = 0; i < 10_000; i++) {
      effect(() => {
        onDispose(disposed);
      });
    }
    return dispose;
  });

  dispose();
  expect(disposed).toHaveBeenCalledTimes(10_000);
});

it('should dispose deep trees', () => {
  const disposed = vi.fn();

  function nest(depth: number) {
    effect(() => {
      onDispose(disposed);
      if (depth > 0) nest(depth - 1);
    });
  }

  const dispose = root((dispose) => {
    nest(500);
    return dispose;
  });

  dispose();
  expect(disposed).toHaveBeenCalledTimes(501);
});

it('should continue disposing remaining nodes when a disposal callback throws and is handled', () => {
  const handler = vi.fn(),
    disposeA = vi.fn(),
    disposeC = vi.fn();

  const dispose = root((dispose) => {
    onError(handler);
    effect(() => onDispose(disposeA));
    effect(() =>
      onDispose(() => {
        throw new Error('b');
      }),
    );
    effect(() => onDispose(disposeC));
    return dispose;
  });

  dispose();
  expect(handler).toHaveBeenCalledTimes(1);
  expect(disposeA).toHaveBeenCalledTimes(1);
  expect(disposeC).toHaveBeenCalledTimes(1);
});

it('should fully unlink a node whose disposal callback throws unhandled', () => {
  const $a = signal(0);

  const dispose = root((dispose) => {
    effect(() => {
      $a.get();
      onDispose(() => {
        throw new Error('boom');
      });
    });
    return dispose;
  });

  expect(internals($a)._observers).toHaveLength(1);
  expect(() => dispose()).toThrow('boom');
  expect(internals($a)._observers).toHaveLength(0);
});

it('should handle dispose called from within a child disposal callback', () => {
  const spy = vi.fn();

  const dispose = root((dispose) => {
    effect(() => {
      onDispose(() => {
        dispose();
        spy();
      });
    });
    return dispose;
  });

  dispose();
  expect(spy).toHaveBeenCalledTimes(1);
});

it('should not run a disposed effect even if it was notified before disposal', () => {
  const $a = signal(0),
    spy = vi.fn();

  const stop = effect(() => {
    spy($a.get());
  });

  $a.set(1);
  stop();
  tick();
  expect(spy).toHaveBeenCalledTimes(1);
});

it('should detach appended scopes from their parent when disposed', () => {
  const parent = createScope(),
    child = createScope();

  parent.append(child);
  expect(parent._children).toEqual([child]);
  expect(child[SCOPE]).toBe(parent);

  child.dispose();
  expect(parent._children).toHaveLength(0);
  expect(child[SCOPE]).toBeNull();
});

it('should reset scope state on dispose', () => {
  const key = Symbol();

  let scope!: Scope;

  const dispose = root((dispose) => {
    scope = getScope()!;
    onError(() => {});
    onDispose(() => {});
    return dispose;
  });

  dispose();
  expect(scope._handlers).toBeNull();
  expect(scope._disposal).toBeNull();
  expect(scope._children).toBeNull();
  expect(scope._context![key]).toBeUndefined();
});
