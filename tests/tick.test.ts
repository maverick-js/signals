import { effect, signal, tick } from '../src';

afterEach(() => tick());

it('should batch updates', () => {
  const effectA = vi.fn();

  const $a = signal(10);

  effect(() => {
    effectA();
    $a();
  });

  $a.set(20);
  $a.set(30);
  $a.set(40);

  expect(effectA).to.toHaveBeenCalledTimes(1);
  tick();
  expect(effectA).to.toHaveBeenCalledTimes(2);
});

it('should wait for queue to flush', () => {
  const effectA = vi.fn();

  const $a = signal(10);

  effect(() => {
    effectA();
    $a();
  });

  expect(effectA).to.toHaveBeenCalledTimes(1);

  $a.set(20);
  tick();
  expect(effectA).to.toHaveBeenCalledTimes(2);

  $a.set(30);
  tick();
  expect(effectA).to.toHaveBeenCalledTimes(3);
});
