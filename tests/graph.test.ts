// https://github.com/preactjs/signals/blob/main/packages/core/test/signal.test.tsx#L1249

import { computed, signal, flushSync } from '../src';

it('should drop A->B->A updates', () => {
  //     A
  //   / |
  //  B  | <- Looks like a flag doesn't it? :D
  //   \ |
  //     C
  //     |
  //     D

  const $a = signal(2),
    $b = computed(() => $a.get() - 1),
    $c = computed(() => $a.get() + $b.get());

  const compute = vi.fn(() => 'd: ' + $c.get());
  const $d = computed(compute);

  expect($d.get()).toBe('d: 3');
  expect(compute).toHaveBeenCalledTimes(1);
  compute.mockReset();

  $a.set(4);
  $d.get();
  flushSync();
  expect(compute).toHaveBeenCalledTimes(1);
});

it('should only update every signal once (diamond graph)', () => {
  // In this scenario "D" should only update once when "A" receives
  // an update. This is sometimes referred to as the "diamond" scenario.
  //     A
  //   /   \
  //  B     C
  //   \   /
  //     D

  const $a = signal('a'),
    $b = computed(() => $a.get()),
    $c = computed(() => $a.get());

  const spy = vi.fn(() => $b.get() + ' ' + $c.get());
  const $d = computed(spy);

  expect($d.get()).toBe('a a');
  expect(spy).toHaveBeenCalledTimes(1);

  $a.set('aa');
  flushSync();
  expect($d.get()).toBe('aa aa');
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should only update every signal once (diamond graph + tail)', () => {
  // "E" will be likely updated twice if our mark+sweep logic is buggy.
  //     A
  //   /   \
  //  B     C
  //   \   /
  //     D
  //     |
  //     E

  const $a = signal('a'),
    $b = computed(() => $a.get()),
    $c = computed(() => $a.get()),
    $d = computed(() => $b.get() + ' ' + $c.get());

  const spy = vi.fn(() => $d.get()),
    $e = computed(spy);

  expect($e.get()).toBe('a a');
  expect(spy).toHaveBeenCalledTimes(1);

  $a.set('aa');
  flushSync();

  expect($e.get()).toBe('aa aa');
  expect(spy).toHaveBeenCalledTimes(2);
});

it('should bail out if result is the same', () => {
  // Bail out if value of "B" never changes
  // A->B->C

  const $a = signal('a');

  const $b = computed(() => {
    $a.get();
    return 'foo';
  });

  const spy = vi.fn(() => $b.get()),
    $c = computed(spy);

  expect($c.get()).toBe('foo');
  expect(spy).toHaveBeenCalledTimes(1);

  $a.set('aa');
  flushSync();
  expect($c.get()).toBe('foo');
  expect(spy).toHaveBeenCalledTimes(1);
});

it('should only update every signal once (jagged diamond graph + tails)', () => {
  // "F" and "G" will be likely updated >3 if our mark+sweep logic is buggy.
  //     A
  //   /   \
  //  B     C
  //  |     |
  //  |     D
  //   \   /
  //     E
  //   /   \
  //  F     G

  const $a = signal('a'),
    $b = computed(() => $a.get()),
    $c = computed(() => $a.get()),
    $d = computed(() => $c.get());

  const eSpy = vi.fn(() => $b.get() + ' ' + $d.get()),
    $e = computed(eSpy);

  const fSpy = vi.fn(() => $e.get()),
    $f = computed(fSpy);

  const gSpy = vi.fn(() => $e.get()),
    $g = computed(gSpy);

  expect($f.get()).toBe('a a');
  expect(fSpy).toHaveBeenCalledTimes(1);

  expect($g.get()).toBe('a a');
  expect(gSpy).toHaveBeenCalledTimes(1);

  $a.set('b');
  flushSync();

  expect($e.get()).toBe('b b');
  expect(eSpy).toHaveBeenCalledTimes(2);

  expect($f.get()).toBe('b b');
  expect(fSpy).toHaveBeenCalledTimes(2);

  expect($g.get()).toBe('b b');
  expect(gSpy).toHaveBeenCalledTimes(2);

  $a.set('c');
  flushSync();

  expect($e.get()).toBe('c c');
  expect(eSpy).toHaveBeenCalledTimes(3);

  expect($f.get()).toBe('c c');
  expect(fSpy).toHaveBeenCalledTimes(3);

  expect($g.get()).toBe('c c');
  expect(gSpy).toHaveBeenCalledTimes(3);
});

it('should only subscribe to signals listened to', () => {
  //    *A
  //   /   \
  // *B     C <- we don't listen to C

  const $a = signal('a');

  const $b = computed(() => $a.get()),
    spy = vi.fn(() => $a.get());

  computed(spy);

  expect($b.get()).toBe('a');
  expect(spy).toBeCalledTimes(0);

  $a.set('aa');
  flushSync();

  expect($b.get()).toBe('aa');
  expect(spy).toBeCalledTimes(0);
});

it('should ensure subs update even if one dep unmarks it', () => {
  // In this scenario "C" always returns the same value. When "A"
  // changes, "B" will update, then "C" at which point its update
  // to "D" will be unmarked. But "D" must still update because
  // "B" marked it. If "D" isn't updated, then we have a bug.
  //     A
  //   /   \
  //  B     *C <- returns same value every time
  //   \   /
  //     D

  const $a = signal('a'),
    $b = computed(() => $a.get()),
    $c = computed(() => {
      $a.get();
      return 'c';
    });

  const spy = vi.fn(() => $b.get() + ' ' + $c.get()),
    $d = computed(spy);

  expect($d.get()).toBe('a c');

  $a.set('aa');
  flushSync();

  expect($d.get()).toBe('aa c');
  expect(spy).toHaveBeenCalledTimes(2);
});

it.only('should ensure subs update even if two deps unmark it', () => {
  // In this scenario both "C" and "D" always return the same
  // value. But "E" must still update because "A"  marked it.
  // If "E" isn't updated, then we have a bug.
  //     A
  //   / | \
  //  B *C *D
  //   \ | /
  //     E

  const $a = signal('a'),
    $b = computed(() => $a.get()),
    $c = computed(() => {
      $a.get();
      return 'c';
    }),
    $d = computed(() => {
      $a.get();
      return 'd';
    });

  const spy = vi.fn(() => $b.get() + ' ' + $c.get() + ' ' + $d.get()),
    $e = computed(spy);

  expect($e.get()).toBe('a c d');

  $a.set('aa');
  flushSync();

  expect($e.get()).toBe('aa c d');
  expect(spy).toHaveBeenCalledTimes(2);
});
