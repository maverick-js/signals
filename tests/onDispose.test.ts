import { effect, tick, onDispose, root } from '../src';

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
    root(() => {
      onDispose(() => disposals.push('SUBTREE 1'));
      effect(() => onDispose(() => disposals.push('+A1')));
      effect(() => onDispose(() => disposals.push('+B1')));
      effect(() => onDispose(() => disposals.push('+C1')));
    });

    root(() => {
      onDispose(() => disposals.push('SUBTREE 2'));
      effect(() => onDispose(() => disposals.push('+A2')));
      effect(() => onDispose(() => disposals.push('+B2')));
      effect(() => onDispose(() => disposals.push('+C2')));
    });

    onDispose(() => disposals.push('ROOT'));

    return dispose;
  });

  dispose();
  expect(disposals).toMatchInlineSnapshot(`
    [
      "+C2",
      "+B2",
      "+A2",
      "SUBTREE 2",
      "+C1",
      "+B1",
      "+A1",
      "SUBTREE 1",
      "ROOT",
    ]
  `);
});
