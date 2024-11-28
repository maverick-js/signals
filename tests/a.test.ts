import { computed, effect, flushSync, signal } from '../src';

it('should react', () => {
  const x = signal(0),
    y = computed(() => x.get() * 2);

  effect(() => {
    console.log(y.get());
  });

  x.set(1);
  flushSync();

  x.set(4);
  flushSync();
});
