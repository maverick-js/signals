import { computed, observable, effect, tick, readonly, isObservable } from '../src';

afterEach(() => tick());

it('should return true if given observable', () => {
  [observable(10), readonly(observable(10)), computed(() => 10)].forEach((type) => {
    expect(isObservable(type)).toBe(true);
  });
});

it('should return false if given non-observable', () => {
  ([false, null, undefined, () => {}, effect(() => {})] as const).forEach((type) =>
    expect(isObservable(type)).toBe(false),
  );
});
