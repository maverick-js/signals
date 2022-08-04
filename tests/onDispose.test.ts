import { effect, tick, onDispose } from '../src';

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

it('should clear disposal early', async () => {
  const dispose = vi.fn();

  const stop = effect(() => {
    const early = onDispose(dispose);
    early();
  });

  expect(dispose).toHaveBeenCalledTimes(1);

  stop();
  await tick();

  expect(dispose).toHaveBeenCalledTimes(1);
});
