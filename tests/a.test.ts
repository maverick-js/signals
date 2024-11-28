import { computed, effect, flushSync, signal } from '../src';

it('', () => {
  const a = signal(1),
    b = signal(1),
    c = computed(() => a.get() + b.get());

  effect(() => {
    console.log('+e');
    if (a.get()) c.get();
  });

  flushSync();

  console.log('1.');
  a.set(0);
  flushSync();

  console.log('2.');
  b.set(1);
  flushSync();
});
