import { effect, peek, root, getScope } from '../src';

it('should return current scope', () => {
  root(() => {
    const rootScope = getScope();
    expect(rootScope).toBeDefined();
    effect(() => {
      expect(getScope()).toBeDefined();
      expect(getScope()).not.toBe(rootScope);
    });
  });
});

it('should return parent scope from inside peek', () => {
  root(() => {
    peek(() => {
      expect(getScope()).toBeDefined();
    });
  });
});
