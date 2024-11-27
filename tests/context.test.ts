import { effect, getContext, getScope, root, type Scope, setContext } from '../src';

it('should get context value', () => {
  const key = Symbol();
  root(() => {
    setContext(key, 100);
    root(() => {
      root(() => {
        setContext(key, 200);
      });

      effect(() => {
        expect(getContext(key)).toBe(100);
      });
    });
  });
});

it('should not throw if no context value is found', () => {
  const key = Symbol();
  root(() => {
    root(() => {
      effect(() => {
        expect(getContext(key)).toBe(undefined);
      });
    });
  });
});

it('should use provided scope', () => {
  let scope!: Scope,
    key = Symbol();

  root(() => {
    scope = getScope()!;
    root(() => {
      effect(() => {
        setContext(key, 200, scope);
      });
    });
  });

  root(() => {
    expect(getContext(key)).toBeUndefined();
    expect(getContext(key, scope)).toBe(200);
  });
});
