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
