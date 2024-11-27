import { effect, flushSync, onDispose, root, createScope, scoped } from '../src';

afterEach(() => flushSync());

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
  flushSync();

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
    flushSync();

    expect(dispose).toHaveBeenCalledTimes(0);
  });
});

it('should dispose in-reverse-order', () => {
  let a, b, c;

  const dispose = root((dispose) => {
    onDispose(() => {
      a = performance.now();
    });

    effect(() => {
      onDispose(() => {
        b = performance.now();
      });

      effect(() => {
        onDispose(() => {
          c = performance.now();
        });
      });
    });

    return dispose;
  });

  dispose();
  expect(c < b < a).toBe(true);
});

it('should dispose all roots', () => {
  const disposals: string[] = [];

  const dispose = root((dispose) => {
    onDispose(() => disposals.push('root'));
    onDispose(() => disposals.push('root_2'));

    root(() => {
      onDispose(() => disposals.push('s1'));

      effect(() => {
        onDispose(() => disposals.push('s1_1'));
        effect(() => onDispose(() => disposals.push('s1_1_1')));
        effect(() => onDispose(() => disposals.push('s1_1_2')));
      });

      effect(() => onDispose(() => disposals.push('s1_2')));
      effect(() => onDispose(() => disposals.push('s1_3')));
    });

    root(() => {
      onDispose(() => disposals.push('s2'));
      effect(() => onDispose(() => disposals.push('s2_1')));
      effect(() => onDispose(() => disposals.push('s2_2')));
      effect(() => onDispose(() => disposals.push('s2_3')));
    });

    return dispose;
  });

  dispose();
  expect(disposals).toMatchInlineSnapshot(`
    [
      "s2_3",
      "s2_2",
      "s2_1",
      "s2",
      "s1_3",
      "s1_2",
      "s1_1_2",
      "s1_1_1",
      "s1_1",
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
