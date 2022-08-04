import { computed, observable, effect, tick, readonly, isSubject } from '../src';

afterEach(() => tick());

it('should return true given subject', () => {
  expect(isSubject(observable(10))).toBe(true);
});

it('should return false if given non-subject', () => {
  (
    [false, () => {}, computed(() => 10), readonly(observable(10)), effect(() => {})] as const
  ).forEach((type) => expect(isSubject(type)).toBe(false));
});
