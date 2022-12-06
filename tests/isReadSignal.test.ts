import { computed, signal, effect, tick, readonly, isReadSignal } from '../src';

afterEach(() => tick());

it('should return true if given signal', () => {
  [signal(10), readonly(signal(10)), computed(() => 10)].forEach((type) => {
    expect(isReadSignal(type)).toBe(true);
  });
});

it('should return false if given non-signal', () => {
  ([false, null, undefined, () => {}, effect(() => {})] as const).forEach((type) =>
    expect(isReadSignal(type)).toBe(false),
  );
});
