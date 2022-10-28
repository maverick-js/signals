import { effect, isObserved, observable } from '../src';

it('should return true if there are observers', () => {
  const a = observable(0);

  effect(() => {
    a();
    expect(isObserved()).toBeTruthy();
  });
});

it('should return false if there are _no_ observers', () => {
  effect(() => {
    expect(isObserved()).toBeFalsy();
  });
});
