import { computed, signal, effect, flushSync, readonly, isWriteSignal } from '../src';

afterEach(() => flushSync());

it('should return true given subject', () => {
  expect(isWriteSignal(signal(10))).toBe(true);
});

it('should return false if given non-subject', () => {
  (
    [
      false,
      null,
      undefined,
      () => {},
      computed(() => 10),
      readonly(signal(10)),
      effect(() => {}),
    ] as const
  ).forEach((type) => expect(isWriteSignal(type)).toBe(false));
});
