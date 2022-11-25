import { effect, getScope, isObserving, observable } from '../src';

it('should return true if there are observers', () => {
  const a = observable(0);

  effect(() => {
    a();
    expect(isObserving(getScope()!)).toBeTruthy();
  });
});

it('should return true if child is observing', () => {
  const $a = observable(0);
  effect(() => {
    effect(() => void $a());
    expect(isObserving(getScope()!)).toBeTruthy();
  });
});

it('should return false if there are _no_ observers', () => {
  effect(() => {
    expect(isObserving(getScope()!)).toBeFalsy();
  });
});
