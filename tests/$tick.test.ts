import { $observable, $effect, $tick } from '../src';

afterEach(() => $tick());

it('should batch updates', async () => {
  const effect = vi.fn();

  const $a = $observable(10);

  $effect(() => {
    effect();
    $a();
  });

  $a.set(20);
  $a.set(30);
  $a.set(40);

  expect(effect).to.toHaveBeenCalledTimes(1);
  await $tick();
  expect(effect).to.toHaveBeenCalledTimes(2);
});

it('should wait for queue to flush', async () => {
  const effect = vi.fn();

  const $a = $observable(10);

  $effect(() => {
    effect();
    $a();
  });

  expect(effect).to.toHaveBeenCalledTimes(1);

  $a.set(20);
  await $tick();
  expect(effect).to.toHaveBeenCalledTimes(2);

  $a.set(30);
  await $tick();
  expect(effect).to.toHaveBeenCalledTimes(3);
});
