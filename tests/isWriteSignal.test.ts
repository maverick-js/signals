import { computed, signal, effect, tick, readonly, isWriteSignal } from '../src';

afterEach(() => tick());

it('should return true given subject', () => {
  expect(isWriteSignal(signal(10))).toBe(true);
});

it('should return false if given non-subject', () => {
  ([false, () => {}, computed(() => 10), readonly(signal(10)), effect(() => {})] as const).forEach(
    (type) => expect(isWriteSignal(type)).toBe(false),
  );
});
