import { effect, observable, peek, root, getScope } from '../src';

it('should be orphan', () => {
  const $a = observable(0);
  expect(getScope($a)).toBeNull();
});

it('should return parent scope', () => {
  root(() => {
    const $a = observable(0);
    expect(getScope($a)).toBeDefined();
  });
});

it('should return current scope', () => {
  root(() => {
    expect(getScope()).toBeDefined();
    effect(() => {
      expect(getScope(getScope())).toBeDefined();
    });
  });
});

it('should return parent scope from inside peek', () => {
  root(() => {
    peek(() => {
      const $a = observable(0);
      expect(getScope($a)).toBeDefined();
    });
  });
});

it('should return grandparent scope', () => {
  root(() => {
    effect(() => {
      const $a = observable(0);
      expect(getScope($a)).toBeDefined();
      expect(getScope(getScope($a)!)).toBeDefined();
    });
  });
});

it('should remove parent scope on dispose', () => {
  root((dispose) => {
    const $a = observable(0);
    dispose();
    expect(getScope($a)).toBeNull();
  });
});

it('should return undefined for scope when given arg', () => {
  root(() => {
    expect(getScope(undefined)).toBeUndefined();
  });
});
