import { effect, observable, peek, root, getParent } from '../src';

it('should be orphan', () => {
  const $a = observable(0);
  expect(getParent($a)).toBeUndefined();
});

it('should return parent', () => {
  root(() => {
    const $a = observable(0);
    expect(getParent($a)).toBeInstanceOf(Function);
  });
});

it('should return current parent', () => {
  root(() => {
    expect(getParent()).toBeInstanceOf(Function);
    effect(() => {
      expect(getParent(getParent())).toBeInstanceOf(Function);
    });
  });
});

it('should return parent from inside peek', () => {
  root(() => {
    peek(() => {
      const $a = observable(0);
      expect(getParent($a)).toBeInstanceOf(Function);
    });
  });
});

it('should return grandparent', () => {
  root(() => {
    effect(() => {
      const $a = observable(0);
      expect(getParent($a)).toBeInstanceOf(Function);
      expect(getParent(getParent($a)!)).toBeInstanceOf(Function);
    });
  });
});

it('should remove parent on dispose', () => {
  root((dispose) => {
    const $a = observable(0);
    dispose();
    expect(getParent($a)).toBeUndefined();
  });
});

it('should return undefined for parent when given arg', () => {
  root(() => {
    expect(getParent(undefined)).toBeUndefined();
  });
});
